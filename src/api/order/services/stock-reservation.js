"use strict";

const RESERVATION_MINUTES = 30;
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

  const reference = value(payload?.reference, 40);
  if (!/^JLA-\d{8}-[A-F0-9]{8}$/.test(reference)) {
    throw new ReservationError("Référence de commande invalide.");
  }

  return {
    reference,
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
      await strapi.db
        .getConnection("products")
        .transacting(trx)
        .where({ document_id: item.productDocumentId })
        .increment("stock", item.quantity);
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

async function reserveOrder(strapi, payload) {
  const input = normalizedPayload(payload);
  await releaseExpiredReservations(strapi);

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
        // Verrouille toutes les lignes Strapi correspondant au produit.
        // Avec Draft & Publish, un même documentId peut correspondre
        // à plusieurs lignes (draft + published).
        const productRows = await strapi.db
          .getConnection("products")
          .transacting(trx)
          .where({ document_id: item.productDocumentId })
          .forUpdate()
          .select("id", "stock");

        // Le produit doit toujours exister.
        if (!productRows.length) {
          throw new ReservationError(
            `Le stock de « ${item.productName} » vient d’être mis à jour. Veuillez actualiser votre panier.`,
            409,
          );
        }

        // Toutes les versions du produit doivent avoir suffisamment de stock.
        const insufficientStock = productRows.some(
          (row) => Number(row.stock) < item.quantity,
        );

        if (insufficientStock) {
          throw new ReservationError(
            `Le stock de « ${item.productName} » vient d’être mis à jour. Veuillez actualiser votre panier.`,
            409,
          );
        }

        // Les lignes sont verrouillées : personne d'autre ne peut modifier
        // leur stock avant la fin de cette transaction.
        const productRowIds = productRows.map((row) => row.id);

        const decremented = await strapi.db
          .getConnection("products")
          .transacting(trx)
          .whereIn("id", productRowIds)
          .decrement("stock", item.quantity);

        // On vérifie que toutes les lignes verrouillées ont bien été mises à jour.
        if (decremented !== productRows.length) {
          throw new ReservationError(
            `Le stock de « ${item.productName} » vient d’être mis à jour. Veuillez actualiser votre panier.`,
            409,
          );
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

async function attachMolliePayment(strapi, documentId, molliePaymentId) {
  const order = await getOrder(strapi, documentId);
  if (!order || !activeReservation(order) || !value(molliePaymentId, 100)) {
    throw new ReservationError(
      "La réservation de commande n'est plus disponible.",
      409,
    );
  }
  await strapi.documents("api::order.order").update({
    documentId,
    data: { molliePaymentId: value(molliePaymentId, 100) },
  });
}

async function confirmPaidReservation(strapi, documentId, paidAt) {
  const order = await getOrder(strapi, documentId);
  if (!order) throw new ReservationError("Commande introuvable.", 404);
  if (order.paymentStatus === "paid") {
    return { refundRequired: order.refundStatus !== "not_required" };
  }

  const paidAtIso = new Date(paidAt || Date.now()).toISOString();
  const expiredBeforePayment =
    !order.stockReservationExpiresAt ||
    paidAtIso > order.stockReservationExpiresAt;
  if (!activeReservation(order) || expiredBeforePayment) {
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

  const confirmedAt = nowIso();
  const claimed = await strapi.db.transaction(async ({ trx }) =>
    strapi.db
      .getConnection("orders")
      .transacting(trx)
      .where({ document_id: documentId })
      .whereNull("stock_reservation_released_at")
      .whereNull("stock_decremented_at")
      .update({ stock_decremented_at: confirmedAt }),
  );
  if (claimed !== 1)
    return confirmPaidReservation(strapi, documentId, paidAtIso);

  await strapi.documents("api::order.order").update({
    documentId,
    data: {
      paymentStatus: "paid",
      paidAt: paidAtIso,
      stockDecrementedAt: confirmedAt,
    },
  });
  return { refundRequired: false };
}

async function recordRefund(strapi, documentId, refund) {
  const status =
    refund?.status === "refunded"
      ? "refunded"
      : refund?.status === "failed"
        ? "failed"
        : "processing";
  await strapi.documents("api::order.order").update({
    documentId,
    data: {
      mollieRefundId: value(refund?.id, 100),
      refundRequestedAt: nowIso(),
      refundStatus: status,
    },
  });
}

async function recordRefundFailure(strapi, documentId) {
  await strapi
    .documents("api::order.order")
    .update({ documentId, data: { refundStatus: "failed" } });
}

module.exports = {
  ReservationError,
  TERMINAL_PAYMENT_STATUSES,
  attachMolliePayment,
  confirmPaidReservation,
  recordRefund,
  recordRefundFailure,
  releaseExpiredReservations,
  releaseReservation,
  reserveOrder,
};
