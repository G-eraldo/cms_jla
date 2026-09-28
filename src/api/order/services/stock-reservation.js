"use strict";

const { randomBytes, timingSafeEqual } = require("node:crypto");

const RESERVATION_MINUTES = 30;
const ORDER_REFERENCE_PATTERN = /^JLA-\d{8}-[A-F0-9]{8,32}$/;
const PAYMENT_VIEW_FIELDS = [
  "reference",
  "molliePaymentId",
  "paymentStatus",
  "confirmationEmailSentAt",
  "refundStatus",
  "accessToken",
];
const { termsHash, termsSnapshot, TERMS_VERSION } = require("./terms");
const {
  PromoCodeError,
  normalizeCode,
  validatePromoCode,
} = require("../../promo-code/services/promo-code");
const TERMINAL_PAYMENT_STATUSES = new Set(["failed", "canceled", "expired"]);

class ReservationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * En-tête HTTP qui porte le jeton de commande. Source unique du nom : le
 * contrôleur l'importe pour lire l'en-tête envoyé par le front.
 */
const ORDER_ACCESS_HEADER = "x-order-token";

/** Jeton opaque remis une seule fois, à la création de la commande. */
const newOrderAccessToken = () => randomBytes(24).toString("hex");

/**
 * Politique d'application du jeton de commande.
 * - "strict"  : le jeton est exigé dès qu'une commande en possède un ;
 * - "compat"  : journaux seulement (déploiement progressif, le temps que le
 *               front transmette le jeton sur tous les appels) ;
 * - "off"     : aucun contrôle (interrupteur de secours).
 */
function orderAccessMode() {
  const mode = String(process.env.ORDER_ACCESS_ENFORCEMENT || "")
    .trim()
    .toLowerCase();
  if (mode === "off") return "off";
  if (mode === "strict") return "strict";
  return "compat";
}

function safeTokenEqual(expected, provided) {
  const left = Buffer.from(String(expected || ""), "utf8");
  const right = Buffer.from(String(provided || ""), "utf8");
  if (!left.length || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Vérifie qu'un appelant détient bien le jeton de la commande chargée. */
function assertOrderToken(order, token) {
  const expected = order?.accessToken;
  if (!expected) return true; // commande créée avant l'introduction du jeton
  const mode = orderAccessMode();
  if (mode === "off") return true;
  if (safeTokenEqual(expected, token)) return true;
  if (mode === "strict") {
    throw new ReservationError("Accès à la commande non autorisé.", 403);
  }
  return false;
}

const ORDER_ACCESS_KINDS = new Set(["lecture", "mutation"]);

/**
 * Garde unique des routes de commande, lectures comme mutations : applique
 * `assertOrderToken` sur une commande déjà chargée, puis journalise le refus en
 * mode compat. Le jeton présenté n'est jamais écrit dans les journaux ; seuls
 * la référence et le type d'appel le sont.
 */
function assertLoadedOrderAccess(strapi, order, token, context = {}) {
  if (assertOrderToken(order, token)) return order;
  if (orderAccessMode() === "compat") {
    const kind = ORDER_ACCESS_KINDS.has(context.kind) ? context.kind : "mutation";
    strapi.log?.warn?.(
      `Commande ${order?.reference || "(sans référence)"} : ${kind} sans jeton de commande valide (mode compat).`,
    );
  }
  return order;
}

/** Charge la commande et vérifie le jeton fourni par l'appelant. */
async function assertOrderAccess(strapi, documentId, token, context = {}) {
  const order = await strapi.documents("api::order.order").findOne({
    documentId,
    fields: ["reference", "accessToken"],
  });
  if (!order) throw new ReservationError("Commande introuvable.", 404);
  return assertLoadedOrderAccess(strapi, order, token, {
    kind: "mutation",
    ...context,
  });
}

const value = (input, maxLength = 255) =>
  String(input || "")
    .trim()
    .slice(0, maxLength);
const amount = (input) => Math.round(Number(input) * 100) / 100;
const nowIso = () => new Date().toISOString();
const activeReservation = (order) =>
  order?.stockReservedAt &&
  !order?.stockReservationReleasedAt &&
  !order?.stockDecrementedAt;

function shippingAmountFor(method, subtotalAmount) {
  if (subtotalAmount >= 60) return 0;
  return method === "pickup" ? 3.9 : 7.9;
}

async function loadProductStockRows(strapi, trx, productDocumentId) {
  return strapi.db
    .getConnection("products")
    .transacting(trx)
    .where({ document_id: productDocumentId })
    .forUpdate()
    .select("id", "stock", "published_at");
}

async function adjustPublishedStock(strapi, trx, productDocumentId, delta) {
  const productRows = await loadProductStockRows(
    strapi,
    trx,
    productDocumentId,
  );
  const publishedRows = productRows.filter((row) => row.published_at);
  if (!publishedRows.length) {
    throw new ReservationError(
      "Le stock d’un bijou vient d’être mis à jour. Veuillez actualiser votre panier.",
      409,
    );
  }

  if (delta < 0) {
    const quantity = Math.abs(delta);
    if (publishedRows.some((row) => Number(row.stock) < quantity)) {
      throw new ReservationError(
        "Le stock d’un bijou vient d’être mis à jour. Veuillez actualiser votre panier.",
        409,
      );
    }
  }

  const publishedIds = publishedRows.map((row) => row.id);
  const query = strapi.db
    .getConnection("products")
    .transacting(trx)
    .whereIn("id", publishedIds);
  const changed =
    delta >= 0
      ? await query.increment("stock", delta)
      : await query.decrement("stock", Math.abs(delta));
  if (changed !== publishedRows.length) {
    throw new ReservationError(
      "Le stock d’un bijou vient d’être mis à jour. Veuillez actualiser votre panier.",
      409,
    );
  }

  const nextStock = Number(publishedRows[0].stock) + delta;
  const draftIds = productRows
    .filter((row) => !row.published_at)
    .map((row) => row.id);
  if (draftIds.length) {
    await strapi.db
      .getConnection("products")
      .transacting(trx)
      .whereIn("id", draftIds)
      .update({ stock: Math.max(0, nextStock) });
  }
}

function normalizedLines(lines) {
  if (!Array.isArray(lines) || !lines.length) {
    throw new ReservationError("Votre panier est vide.");
  }

  const grouped = new Map();
  for (const line of lines) {
    const productDocumentId = value(line?.productDocumentId, 100);
    const quantity = Number(line?.quantity);
    if (!productDocumentId || !Number.isInteger(quantity) || quantity < 1) {
      throw new ReservationError("Votre panier contient un article invalide.");
    }
    grouped.set(
      productDocumentId,
      (grouped.get(productDocumentId) || 0) + quantity,
    );
  }

  const result = [...grouped]
    .map(([productDocumentId, quantity]) => ({ productDocumentId, quantity }))
    .sort((left, right) =>
      left.productDocumentId.localeCompare(right.productDocumentId),
    );

  if (result.some((line) => line.quantity > 10)) {
    throw new ReservationError(
      "La quantité maximale par bijou est de 10 exemplaires.",
    );
  }
  return result;
}

function normalizedPayload(payload) {
  const customer = payload?.customer || {};
  const delivery = payload?.delivery || {};
  const required = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "addressLine1",
    "postalCode",
    "city",
  ];
  if (required.some((field) => !value(customer[field]))) {
    throw new ReservationError(
      "Veuillez compléter vos informations de livraison.",
    );
  }
  if (!["home", "pickup"].includes(delivery.method)) {
    throw new ReservationError("Mode de livraison invalide.");
  }
  if (
    delivery.method === "pickup" &&
    (!value(delivery.pickupPoint) || !value(delivery.pickupPointId))
  ) {
    throw new ReservationError(
      "Veuillez sélectionner un point relais Mondial Relay.",
    );
  }

  const reference = value(payload?.reference, 48);
  if (!ORDER_REFERENCE_PATTERN.test(reference)) {
    throw new ReservationError("Référence de commande invalide.");
  }

  return {
    reference,
    checkoutKey: value(payload?.checkoutKey, 64) || null,
    customer: {
      firstName: value(customer.firstName, 100),
      lastName: value(customer.lastName, 100),
      email: value(customer.email, 150).toLowerCase(),
      phone: value(customer.phone, 30),
      addressLine1: value(customer.addressLine1, 200),
      addressLine2: value(customer.addressLine2, 200) || null,
      postalCode: value(customer.postalCode, 20),
      city: value(customer.city, 100),
    },
    delivery: {
      method: delivery.method,
      pickupPoint: value(delivery.pickupPoint, 200) || null,
      pickupPointId: value(delivery.pickupPointId, 100) || null,
    },
    lines: normalizedLines(payload?.items),
    promoCode: normalizeCode(payload?.promoCode) || null,
  };
}

async function getOrder(strapi, documentId) {
  return strapi.documents("api::order.order").findOne({
    documentId,
    fields: [
      "reference",
      "paymentStatus",
      "fulfillmentStatus",
      "molliePaymentId",
      "paidAt",
      "stockReservedAt",
      "stockReservationExpiresAt",
      "stockReservationReleasedAt",
      "stockDecrementedAt",
      "refundStatus",
      "checkoutKey",
      "totalAmount",
      "currency",
    ],
    populate: { items: { fields: ["productDocumentId", "quantity"] } },
  });
}

async function releaseReservation(strapi, documentId) {
  const order = await getOrder(strapi, documentId);
  if (!order || !activeReservation(order)) return false;

  const releasedAt = nowIso();
  return strapi.db.transaction(async ({ trx }) => {
    const claimed = await strapi.db
      .getConnection("orders")
      .transacting(trx)
      .where({ document_id: documentId })
      .whereNull("stock_reservation_released_at")
      .whereNull("stock_decremented_at")
      .update({ stock_reservation_released_at: releasedAt });
    if (claimed !== 1) return false;

    for (const item of normalizedLines(order.items)) {
      await adjustPublishedStock(
        strapi,
        trx,
        item.productDocumentId,
        item.quantity,
      );
    }
    return true;
  });
}

async function releaseExpiredReservations(strapi) {
  const expired = await strapi.db
    .getConnection("orders")
    .select("document_id")
    .where("stock_reservation_expires_at", "<=", nowIso())
    .whereNull("stock_reservation_released_at")
    .whereNull("stock_decremented_at")
    .where({ payment_status: "pending" });

  for (const order of expired) {
    await releaseReservation(strapi, order.document_id);
  }
}

async function findReusableReservation(strapi, checkoutKey) {
  if (!checkoutKey) return null;
  const existing = await strapi.documents("api::order.order").findMany({
    filters: { checkoutKey },
    fields: [
      "reference",
      "paymentStatus",
      "molliePaymentId",
      "stockReservedAt",
      "stockReservationExpiresAt",
      "stockReservationReleasedAt",
      "stockDecrementedAt",
      "totalAmount",
      "checkoutKey",
    ],
    limit: 1,
  });
  const order = existing[0];
  if (!order) return null;
  if (activeReservation(order) && order.paymentStatus === "pending")
    return order;
  await strapi.documents("api::order.order").update({
    documentId: order.documentId,
    data: { checkoutKey: null },
  });
  return null;
}

async function reserveOrder(strapi, payload) {
  const input = normalizedPayload(payload);
  await releaseExpiredReservations(strapi);
  const reusable = await findReusableReservation(strapi, input.checkoutKey);
  if (reusable) return reusable;

  const products = await strapi.documents("api::product.product").findMany({
    fields: ["name", "price", "stock"],
    filters: {
      documentId: { $in: input.lines.map((line) => line.productDocumentId) },
    },
    status: "published",
    limit: input.lines.length,
  });
  const productsById = new Map(
    products.map((product) => [product.documentId, product]),
  );
  const missing = input.lines.find(
    (line) => !productsById.has(line.productDocumentId),
  );
  if (missing)
    throw new ReservationError(
      "Un bijou de votre panier n'est plus disponible.",
      409,
    );

  const items = input.lines.map((line) => {
    const product = productsById.get(line.productDocumentId);
    const price = amount(product.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new ReservationError("Le prix d'un bijou est indisponible.", 503);
    }
    return {
      productDocumentId: product.documentId,
      productName: product.name,
      unitPrice: price,
      quantity: line.quantity,
    };
  });
  const subtotalAmount = amount(
    items.reduce((total, item) => total + item.unitPrice * item.quantity, 0),
  );
  let promotion = null;
  try {
    promotion = input.promoCode
      ? await validatePromoCode(strapi, input.promoCode, subtotalAmount)
      : null;
  } catch (error) {
    if (error instanceof PromoCodeError)
      throw new ReservationError(error.message, error.statusCode);
    throw error;
  }
  const discountAmount = amount(promotion?.discountAmount || 0);
  const shippingAmount = shippingAmountFor(
    input.delivery.method,
    subtotalAmount,
  );
  const reservedAt = nowIso();
  const expiresAt = new Date(
    Date.now() + RESERVATION_MINUTES * 60 * 1000,
  ).toISOString();

  try {
    return await strapi.db.transaction(async ({ trx }) => {
      for (const item of items) {
        try {
          await adjustPublishedStock(
            strapi,
            trx,
            item.productDocumentId,
            -item.quantity,
          );
        } catch (error) {
          if (error instanceof ReservationError) {
            throw new ReservationError(
              `Le stock de « ${item.productName} » vient d’être mis à jour. Veuillez actualiser votre panier.`,
              409,
            );
          }
          throw error;
        }
      }

      return strapi.documents("api::order.order").create({
        data: {
          reference: input.reference,
          ...input.customer,
          country: "France",
          deliveryMethod: input.delivery.method,
          pickupPoint: input.delivery.pickupPoint,
          pickupPointId: input.delivery.pickupPointId,
          items,
          subtotalAmount,
          promoCode: promotion?.code || null,
          promoKind: promotion?.kind || null,
          promoValue: promotion?.value || null,
          discountAmount,
          shippingAmount,
          totalAmount: amount(subtotalAmount - discountAmount + shippingAmount),
          currency: "EUR",
          paymentStatus: "pending",
          fulfillmentStatus: "pending",
          stockReservedAt: reservedAt,
          stockReservationExpiresAt: expiresAt,
          refundStatus: "not_required",
          // Server-side proof: the client only signals acceptance; this immutable
          // snapshot identifies exactly what was accepted at this instant.
          checkoutKey: input.checkoutKey,
          accessToken: newOrderAccessToken(),
          termsVersion: TERMS_VERSION,
          termsHash: termsHash(),
          termsSnapshot: termsSnapshot(),
          termsAcceptedAt: reservedAt,
        },
      });
    });
  } catch (error) {
    if (error instanceof ReservationError) throw error;
    throw new ReservationError(
      "La réservation du stock est temporairement indisponible.",
      503,
    );
  }
}

const MOLLIE_API_BASE = "https://api.mollie.com/v2";
const MOLLIE_REFUND_STATUSES = {
  refunded: "refunded",
  failed: "failed",
  canceled: "failed",
  queued: "processing",
  pending: "processing",
  processing: "processing",
};

/** Statuts Mollie qui prouvent qu'un remboursement a bien échoué. */
const MOLLIE_FAILED_REFUND_STATUSES = new Set(["failed", "canceled"]);

const mollieOrderDocumentId = (payment) =>
  payment?.metadata?.orderDocumentId ||
  payment?.metadata?.order_document_id ||
  null;

/**
 * Indique si une vérification auprès de Mollie est possible. Hors production,
 * l'absence de clé conserve le comportement de développement (aucune
 * vérification) ; en production, l'absence de clé est une erreur bloquante.
 */
function mollieVerificationAvailable() {
  if (process.env.MOLLIE_API_KEY) return true;
  if (process.env.NODE_ENV === "production") {
    throw new ReservationError("Le paiement n'a pas pu être vérifié.", 503);
  }
  return false;
}

/** Interroge l'API Mollie. Retourne null uniquement si la ressource est absente. */
async function mollieRequest(path) {
  const apiKey = process.env.MOLLIE_API_KEY;
  const response = await fetch(`${MOLLIE_API_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new ReservationError("Le paiement n'a pas pu être vérifié.", 502);
  }
  return response.json();
}

/** Un paiement ne peut agir que sur la commande qu'il référence. */
function assertPaymentMatchesOrder(payment, order) {
  const metadataDocumentId = mollieOrderDocumentId(payment);
  if (!metadataDocumentId) {
    throw new ReservationError(
      "Le paiement ne référence pas cette commande.",
      409,
    );
  }
  if (metadataDocumentId !== order.documentId) {
    throw new ReservationError(
      "Le paiement ne correspond pas à cette commande.",
      409,
    );
  }
}

async function attachMolliePayment(strapi, documentId, molliePaymentId) {
  const order = await getOrder(strapi, documentId);
  const paymentId = value(molliePaymentId, 100);
  if (!order || !activeReservation(order) || !paymentId) {
    throw new ReservationError(
      "La réservation de commande n'est plus disponible.",
      409,
    );
  }

  if (mollieVerificationAvailable()) {
    const payment = await mollieRequest(
      `payments/${encodeURIComponent(paymentId)}`,
    );
    if (!payment) {
      throw new ReservationError(
        "Le paiement est introuvable chez Mollie.",
        409,
      );
    }
    assertPaymentMatchesOrder(payment, order);
  }

  await strapi.documents("api::order.order").update({
    documentId,
    data: { molliePaymentId: paymentId },
  });
}

async function verifyMolliePaid(order) {
  if (!mollieVerificationAvailable()) return null;
  if (!order.molliePaymentId) {
    throw new ReservationError(
      "Le paiement n'est pas rattaché à la commande.",
      409,
    );
  }

  const payment = await mollieRequest(
    `payments/${encodeURIComponent(order.molliePaymentId)}`,
  );
  if (!payment) {
    throw new ReservationError("Le paiement est introuvable chez Mollie.", 409);
  }
  if (payment.status !== "paid") {
    throw new ReservationError("Le paiement n'est pas encaissé.", 409);
  }
  assertPaymentMatchesOrder(payment, order);

  const paidAmount = amount(payment.amount?.value);
  const orderAmount = amount(order.totalAmount);
  if (!Number.isFinite(paidAmount) || paidAmount !== orderAmount) {
    throw new ReservationError(
      "Le montant encaissé ne correspond pas au montant de la commande.",
      409,
    );
  }
  if (
    payment.amount?.currency &&
    order.currency &&
    payment.amount.currency !== order.currency
  ) {
    throw new ReservationError(
      "La devise encaissée ne correspond pas à celle de la commande.",
      409,
    );
  }
  return payment;
}
async function confirmPaidReservation(strapi, documentId, paidAt) {
  const order = await getOrder(strapi, documentId);
  if (!order) throw new ReservationError("Commande introuvable.", 404);
  if (order.paymentStatus === "paid") {
    return { refundRequired: order.refundStatus !== "not_required" };
  }

  const payment = await verifyMolliePaid(order);
  const paidAtIso = new Date(
    payment?.paidAt || paidAt || Date.now(),
  ).toISOString();
  const confirmedAt = nowIso();

  const claimed = await strapi.db.transaction(async ({ trx }) =>
    strapi.db
      .getConnection("orders")
      .transacting(trx)
      .where({ document_id: documentId, payment_status: "pending" })
      .whereNull("stock_reservation_released_at")
      .whereNull("stock_decremented_at")
      .where("stock_reservation_expires_at", ">=", paidAtIso)
      .update({
        stock_decremented_at: confirmedAt,
        payment_status: "paid",
        paid_at: paidAtIso,
      }),
  );

  if (claimed === 1) return { refundRequired: false };

  const latest = await getOrder(strapi, documentId);
  if (latest?.paymentStatus === "paid") {
    return { refundRequired: latest.refundStatus !== "not_required" };
  }

  await releaseReservation(strapi, documentId);
  await strapi.documents("api::order.order").update({
    documentId,
    data: {
      paymentStatus: "paid",
      paidAt: paidAtIso,
      fulfillmentStatus: "canceled",
      refundStatus: "pending",
    },
  });
  return { refundRequired: true };
}

async function recordPaymentOutcome(strapi, documentId, paymentStatus) {
  if (!TERMINAL_PAYMENT_STATUSES.has(paymentStatus)) {
    throw new ReservationError("Statut de paiement invalide.", 400);
  }
  const order = await getOrder(strapi, documentId);
  if (!order) throw new ReservationError("Commande introuvable.", 404);
  if (order.paymentStatus === "paid") {
    throw new ReservationError("Cette commande est déjà payée.", 409);
  }

  if (mollieVerificationAvailable()) {
    if (!order.molliePaymentId) {
      throw new ReservationError(
        "Le paiement n'est pas rattaché à la commande.",
        409,
      );
    }
    const payment = await mollieRequest(
      `payments/${encodeURIComponent(order.molliePaymentId)}`,
    );
    if (!payment) {
      throw new ReservationError(
        "Le paiement est introuvable chez Mollie.",
        409,
      );
    }
    assertPaymentMatchesOrder(payment, order);
    if (payment.status !== paymentStatus) {
      throw new ReservationError(
        "Le statut annoncé ne correspond pas au statut réel du paiement.",
        409,
      );
    }
  }

  if (order.paymentStatus === paymentStatus) return false;
  await strapi.documents("api::order.order").update({
    documentId,
    data: { paymentStatus },
  });
  return true;
}
async function findPaymentView(strapi, filters) {
  if (filters.documentId) {
    return strapi.documents("api::order.order").findOne({
      documentId: filters.documentId,
      fields: PAYMENT_VIEW_FIELDS,
    });
  }

  const [order] = await strapi.documents("api::order.order").findMany({
    filters: filters.reference
      ? { reference: filters.reference }
      : { molliePaymentId: filters.molliePaymentId },
    fields: PAYMENT_VIEW_FIELDS,
    limit: 1,
  });
  return order || null;
}

async function anonymizeAbandonedOrders(strapi) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const abandoned = await strapi.documents("api::order.order").findMany({
    filters: {
      paymentStatus: { $in: ["pending", "failed", "canceled", "expired"] },
      createdAt: { $lt: cutoff },
    },
    fields: ["email", "paymentStatus"],
    limit: 50,
  });

  let anonymized = 0;
  for (const order of abandoned) {
    if (String(order.email || "").endsWith("@invalid.invalid")) continue;
    await releaseReservation(strapi, order.documentId);
    await strapi.documents("api::order.order").update({
      documentId: order.documentId,
      data: {
        firstName: "Anonymisé",
        lastName: "Anonymisé",
        email: `anonymized-${order.documentId}@invalid.invalid`,
        phone: "0000000000",
        addressLine1: "Anonymisé",
        addressLine2: null,
        pickupPoint: null,
      },
    });
    anonymized += 1;
  }
  return anonymized;
}

async function recordRefund(strapi, documentId, refund) {
  const order = await getOrder(strapi, documentId);
  if (!order) throw new ReservationError("Commande introuvable.", 404);
  const refundId = value(refund?.id, 100);
  if (!refundId) {
    throw new ReservationError("Le remboursement transmis est invalide.", 400);
  }

  let status;
  if (mollieVerificationAvailable()) {
    if (!order.molliePaymentId) {
      throw new ReservationError(
        "Le paiement n'est pas rattaché à la commande.",
        409,
      );
    }
    const verified = await mollieRequest(
      `payments/${encodeURIComponent(order.molliePaymentId)}/refunds/${encodeURIComponent(refundId)}`,
    );
    if (!verified) {
      throw new ReservationError(
        "Le remboursement est introuvable chez Mollie.",
        409,
      );
    }
    status = MOLLIE_REFUND_STATUSES[verified.status];
    if (!status) {
      throw new ReservationError(
        "Le statut du remboursement renvoyé par Mollie est inconnu.",
        409,
      );
    }
  } else {
    status =
      refund?.status === "refunded"
        ? "refunded"
        : refund?.status === "failed"
          ? "failed"
          : "processing";
  }

  await strapi.documents("api::order.order").update({
    documentId,
    data: {
      mollieRefundId: refundId,
      refundRequestedAt: nowIso(),
      refundStatus: status,
    },
  });
}
/** Liste les remboursements d'un paiement chez Mollie. */
async function mollieRefundsForPayment(paymentId) {
  const payload = await mollieRequest(
    `payments/${encodeURIComponent(paymentId)}/refunds`,
  );
  const refunds = payload?._embedded?.refunds;
  return Array.isArray(refunds) ? refunds : [];
}

/**
 * Enregistre l'échec d'un remboursement. Comme `recordRefund`, l'écriture n'a
 * lieu qu'après vérification auprès de Mollie : soit le remboursement transmis
 * est en échec, soit l'un des remboursements du paiement rattaché à la commande
 * l'est. Un échec non confirmé par Mollie n'est jamais enregistré.
 */
async function recordRefundFailure(strapi, documentId, refund) {
  const order = await getOrder(strapi, documentId);
  if (!order) throw new ReservationError("Commande introuvable.", 404);
  const refundId = value(refund?.id, 100);

  if (mollieVerificationAvailable()) {
    if (!order.molliePaymentId) {
      throw new ReservationError(
        "Le paiement n'est pas rattaché à la commande.",
        409,
      );
    }
    const refundsPath = `payments/${encodeURIComponent(order.molliePaymentId)}/refunds`;
    let failureConfirmed = false;
    if (refundId) {
      const verified = await mollieRequest(
        `${refundsPath}/${encodeURIComponent(refundId)}`,
      );
      if (!verified) {
        throw new ReservationError(
          "Le remboursement est introuvable chez Mollie.",
          409,
        );
      }
      failureConfirmed = MOLLIE_FAILED_REFUND_STATUSES.has(verified.status);
    } else {
      const refunds = await mollieRefundsForPayment(order.molliePaymentId);
      failureConfirmed = refunds.some((item) =>
        MOLLIE_FAILED_REFUND_STATUSES.has(item?.status),
      );
    }
    if (!failureConfirmed) {
      throw new ReservationError(
        "Aucun remboursement en échec n'est confirmé par Mollie.",
        409,
      );
    }
  }

  await strapi.documents("api::order.order").update({
    documentId,
    data: { refundStatus: "failed" },
  });
}

module.exports = {
  ReservationError,
  TERMINAL_PAYMENT_STATUSES,
  ORDER_ACCESS_HEADER,
  anonymizeAbandonedOrders,
  assertLoadedOrderAccess,
  assertOrderAccess,
  assertOrderToken,
  attachMolliePayment,
  confirmPaidReservation,
  findPaymentView,
  newOrderAccessToken,
  recordPaymentOutcome,
  recordRefund,
  recordRefundFailure,
  releaseExpiredReservations,
  releaseReservation,
  reserveOrder,
};
