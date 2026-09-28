"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ReservationError,
  attachMolliePayment,
  confirmPaidReservation,
  findPaymentView,
  recordPaymentOutcome,
  recordRefund,
  recordRefundFailure,
} = require("../src/api/order/services/stock-reservation");

const originalFetch = globalThis.fetch;
const originalKey = process.env.MOLLIE_API_KEY;
const originalNodeEnv = process.env.NODE_ENV;

const is409 = (error) =>
  error instanceof ReservationError && error.statusCode === 409;
const is503 = (error) =>
  error instanceof ReservationError && error.statusCode === 503;

function baseOrder(overrides = {}) {
  return {
    documentId: "doc-1",
    reference: "JLA-20260928-ABCDEF01",
    paymentStatus: "pending",
    fulfillmentStatus: "processing",
    molliePaymentId: "tr_abc123",
    refundStatus: "not_required",
    totalAmount: 45,
    currency: "EUR",
    stockReservedAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeStrapi(order) {
  const updates = [];
  return {
    updates,
    log: { error() {}, warn() {}, info() {} },
    documents() {
      return {
        async findOne() {
          return order;
        },
        async findMany() {
          return order ? [order] : [];
        },
        async update({ data }) {
          updates.push(data);
          Object.assign(order, data);
          return { ...order, ...data };
        },
      };
    },
  };
}

function mollieResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

const paidPayment = (overrides = {}) => ({
  id: "tr_abc123",
  status: "paid",
  amount: { value: "45.00", currency: "EUR" },
  metadata: { orderDocumentId: "doc-1" },
  ...overrides,
});

test.beforeEach(() => {
  process.env.MOLLIE_API_KEY = "test_mollie_key";
  delete process.env.NODE_ENV;
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test.after(() => {
  if (originalKey === undefined) delete process.env.MOLLIE_API_KEY;
  else process.env.MOLLIE_API_KEY = originalKey;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test("la vue de paiement n'expose plus checkoutKey", async () => {
  let captured = null;
  const strapi = {
    documents: () => ({
      async findOne(params) {
        captured = params.fields;
        return {};
      },
    }),
  };

  await findPaymentView(strapi, { documentId: "doc-1" });

  assert.ok(Array.isArray(captured), "la vue doit préciser ses champs");
  assert.equal(captured.includes("checkoutKey"), false);
  assert.equal(captured.includes("molliePaymentId"), true);
});

test("recordPaymentOutcome refuse un statut qui ne correspond pas à Mollie", async () => {
  const order = baseOrder();
  const strapi = fakeStrapi(order);
  globalThis.fetch = async () =>
    mollieResponse({
      id: "tr_abc123",
      status: "open",
      metadata: { orderDocumentId: "doc-1" },
    });

  await assert.rejects(
    () => recordPaymentOutcome(strapi, "doc-1", "failed"),
    is409,
  );
  assert.equal(strapi.updates.length, 0);
  assert.equal(order.paymentStatus, "pending");
});

test("recordPaymentOutcome enregistre un statut confirmé par Mollie", async () => {
  const order = baseOrder();
  const strapi = fakeStrapi(order);
  globalThis.fetch = async () =>
    mollieResponse({
      id: "tr_abc123",
      status: "failed",
      metadata: { orderDocumentId: "doc-1" },
    });

  const changed = await recordPaymentOutcome(strapi, "doc-1", "failed");

  assert.equal(changed, true);
  assert.equal(order.paymentStatus, "failed");
});

test("recordPaymentOutcome refuse un paiement rattaché à une autre commande", async () => {
  const order = baseOrder();
  const strapi = fakeStrapi(order);
  globalThis.fetch = async () =>
    mollieResponse({
      id: "tr_abc123",
      status: "failed",
      metadata: { orderDocumentId: "doc-autre" },
    });

  await assert.rejects(
    () => recordPaymentOutcome(strapi, "doc-1", "failed"),
    is409,
  );
  assert.equal(strapi.updates.length, 0);
});

test("recordRefund écrit le statut réel renvoyé par Mollie", async () => {
  const order = baseOrder({ paymentStatus: "paid" });
  const strapi = fakeStrapi(order);
  globalThis.fetch = async () => mollieResponse({ id: "re_1", status: "refunded" });

  await recordRefund(strapi, "doc-1", { id: "re_1", status: "processing" });

  assert.equal(order.refundStatus, "refunded");
  assert.equal(order.mollieRefundId, "re_1");
});

test("recordRefund refuse un remboursement inconnu de Mollie", async () => {
  const order = baseOrder({ paymentStatus: "paid" });
  const strapi = fakeStrapi(order);
  globalThis.fetch = async () => mollieResponse({}, 404);

  await assert.rejects(
    () => recordRefund(strapi, "doc-1", { id: "re_inconnu", status: "refunded" }),
    is409,
  );
  assert.equal(strapi.updates.length, 0);
  assert.equal(order.refundStatus, "not_required");
});

test("recordRefund refuse un remboursement sans identifiant", async () => {
  const order = baseOrder({ paymentStatus: "paid" });
  const strapi = fakeStrapi(order);

  await assert.rejects(
    () => recordRefund(strapi, "doc-1", { status: "refunded" }),
    (error) => error instanceof ReservationError && error.statusCode === 400,
  );
  assert.equal(strapi.updates.length, 0);
});

test("confirmPaidReservation refuse un montant encaissé différent", async () => {
  const order = baseOrder({ totalAmount: 45 });
  const strapi = fakeStrapi(order);
  globalThis.fetch = async () =>
    mollieResponse(
      paidPayment({ amount: { value: "10.00", currency: "EUR" } }),
    );

  await assert.rejects(
    () => confirmPaidReservation(strapi, "doc-1", "2026-09-28T10:00:00.000Z"),
    is409,
  );
  assert.equal(strapi.updates.length, 0);
});

test("confirmPaidReservation refuse un paiement sans référence de commande", async () => {
  const order = baseOrder();
  const strapi = fakeStrapi(order);
  globalThis.fetch = async () => mollieResponse(paidPayment({ metadata: {} }));

  await assert.rejects(
    () => confirmPaidReservation(strapi, "doc-1", "2026-09-28T10:00:00.000Z"),
    is409,
  );
  assert.equal(strapi.updates.length, 0);
});

test("confirmPaidReservation refuse une devise différente", async () => {
  const order = baseOrder({ currency: "EUR" });
  const strapi = fakeStrapi(order);
  globalThis.fetch = async () =>
    mollieResponse(
      paidPayment({ amount: { value: "45.00", currency: "USD" } }),
    );

  await assert.rejects(
    () => confirmPaidReservation(strapi, "doc-1", "2026-09-28T10:00:00.000Z"),
    is409,
  );
  assert.equal(strapi.updates.length, 0);
});

test("attachMolliePayment refuse un paiement rattaché à une autre commande", async () => {
  const order = baseOrder();
  const strapi = fakeStrapi(order);
  globalThis.fetch = async () =>
    mollieResponse({
      id: "tr_autre",
      status: "open",
      metadata: { orderDocumentId: "doc-autre" },
    });

  await assert.rejects(
    () => attachMolliePayment(strapi, "doc-1", "tr_autre"),
    is409,
  );
  assert.equal(strapi.updates.length, 0);
});

test("sans clé Mollie hors production, le comportement de développement est conservé", async () => {
  delete process.env.MOLLIE_API_KEY;
  const order = baseOrder({ paymentStatus: "paid" });
  const strapi = fakeStrapi(order);
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return mollieResponse({});
  };

  await recordRefund(strapi, "doc-1", { id: "re_1", status: "refunded" });

  assert.equal(called, false);
  assert.equal(order.refundStatus, "refunded");
});

test("en production sans clé Mollie, la vérification échoue fermée", async () => {
  delete process.env.MOLLIE_API_KEY;
  process.env.NODE_ENV = "production";
  const order = baseOrder({ paymentStatus: "paid" });
  const strapi = fakeStrapi(order);

  await assert.rejects(
    () => recordRefund(strapi, "doc-1", { id: "re_1", status: "refunded" }),
    is503,
  );
  assert.equal(strapi.updates.length, 0);
});

/**
 * Route les appels Mollie selon l'URL : la fiche d'un paiement, un
 * remboursement précis, ou la liste des remboursements du paiement.
 */
function mollieRouter({ payment, refund, refunds }) {
  return async (url) => {
    const path = String(url).replace("https://api.mollie.com/v2/", "");
    if (path.endsWith("/refunds")) {
      if (refunds === undefined) return mollieResponse({}, 404);
      return mollieResponse({
        count: refunds.length,
        _embedded: { refunds },
      });
    }
    if (path.includes("/refunds/")) {
      if (refund === undefined) return mollieResponse({}, 404);
      return mollieResponse(refund);
    }
    if (payment === undefined) return mollieResponse({}, 404);
    return mollieResponse(payment);
  };
}

test("attachMolliePayment refuse un paiement absent chez Mollie", async () => {
  const order = baseOrder();
  const strapi = fakeStrapi(order);
  globalThis.fetch = mollieRouter({});

  await assert.rejects(
    () => attachMolliePayment(strapi, "doc-1", "tr_abc123"),
    is409,
  );
  assert.equal(strapi.updates.length, 0);
  assert.equal(order.molliePaymentId, "tr_abc123");
});

test("attachMolliePayment refuse un paiement sans référence de commande", async () => {
  const order = baseOrder();
  const strapi = fakeStrapi(order);
  globalThis.fetch = mollieRouter({
    payment: { id: "tr_abc123", status: "open", metadata: {} },
  });

  await assert.rejects(
    () => attachMolliePayment(strapi, "doc-1", "tr_abc123"),
    is409,
  );
  assert.equal(strapi.updates.length, 0);
});

test("recordPaymentOutcome refuse un paiement absent chez Mollie", async () => {
  const order = baseOrder();
  const strapi = fakeStrapi(order);
  globalThis.fetch = mollieRouter({});

  await assert.rejects(
    () => recordPaymentOutcome(strapi, "doc-1", "failed"),
    is409,
  );
  assert.equal(strapi.updates.length, 0);
  assert.equal(order.paymentStatus, "pending");
});

test("recordPaymentOutcome refuse un paiement sans référence de commande", async () => {
  const order = baseOrder();
  const strapi = fakeStrapi(order);
  globalThis.fetch = mollieRouter({
    payment: { id: "tr_abc123", status: "failed", metadata: {} },
  });

  await assert.rejects(
    () => recordPaymentOutcome(strapi, "doc-1", "failed"),
    is409,
  );
  assert.equal(strapi.updates.length, 0);
  assert.equal(order.paymentStatus, "pending");
});

test("recordRefundFailure refuse un échec non confirmé par Mollie", async () => {
  const order = baseOrder({ paymentStatus: "paid", refundStatus: "pending" });
  const strapi = fakeStrapi(order);
  globalThis.fetch = mollieRouter({ refunds: [] });

  await assert.rejects(() => recordRefundFailure(strapi, "doc-1"), is409);
  assert.equal(strapi.updates.length, 0);
  assert.equal(order.refundStatus, "pending");
});

test("recordRefundFailure refuse un remboursement encaissé chez Mollie", async () => {
  const order = baseOrder({ paymentStatus: "paid", refundStatus: "pending" });
  const strapi = fakeStrapi(order);
  globalThis.fetch = mollieRouter({
    refunds: [{ id: "re_1", status: "refunded" }],
  });

  await assert.rejects(() => recordRefundFailure(strapi, "doc-1"), is409);
  assert.equal(strapi.updates.length, 0);
  assert.equal(order.refundStatus, "pending");
});

test("recordRefundFailure enregistre un échec confirmé par Mollie", async () => {
  const order = baseOrder({ paymentStatus: "paid", refundStatus: "pending" });
  const strapi = fakeStrapi(order);
  globalThis.fetch = mollieRouter({
    refunds: [{ id: "re_1", status: "failed" }],
  });

  await recordRefundFailure(strapi, "doc-1");

  assert.equal(order.refundStatus, "failed");
  assert.equal(strapi.updates.length, 1);
});

test("recordRefundFailure refuse un remboursement transmis sans échec", async () => {
  const order = baseOrder({ paymentStatus: "paid", refundStatus: "pending" });
  const strapi = fakeStrapi(order);
  globalThis.fetch = mollieRouter({ refund: { id: "re_1", status: "pending" } });

  await assert.rejects(
    () => recordRefundFailure(strapi, "doc-1", { id: "re_1" }),
    is409,
  );
  assert.equal(strapi.updates.length, 0);
  assert.equal(order.refundStatus, "pending");
});

test("recordRefundFailure enregistre le remboursement transmis en échec", async () => {
  const order = baseOrder({ paymentStatus: "paid", refundStatus: "pending" });
  const strapi = fakeStrapi(order);
  globalThis.fetch = mollieRouter({ refund: { id: "re_1", status: "canceled" } });

  await recordRefundFailure(strapi, "doc-1", { id: "re_1" });

  assert.equal(order.refundStatus, "failed");
});

test("recordRefundFailure refuse un remboursement inconnu de Mollie", async () => {
  const order = baseOrder({ paymentStatus: "paid", refundStatus: "pending" });
  const strapi = fakeStrapi(order);
  globalThis.fetch = mollieRouter({});

  await assert.rejects(
    () => recordRefundFailure(strapi, "doc-1", { id: "re_inconnu" }),
    is409,
  );
  assert.equal(strapi.updates.length, 0);
});

test("recordRefundFailure refuse une commande sans paiement rattaché", async () => {
  const order = baseOrder({
    paymentStatus: "paid",
    refundStatus: "pending",
    molliePaymentId: null,
  });
  const strapi = fakeStrapi(order);
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return mollieResponse({});
  };

  await assert.rejects(() => recordRefundFailure(strapi, "doc-1"), is409);
  assert.equal(called, false);
  assert.equal(strapi.updates.length, 0);
});

test("en production sans clé Mollie, l'échec de remboursement échoue fermé", async () => {
  delete process.env.MOLLIE_API_KEY;
  process.env.NODE_ENV = "production";
  const order = baseOrder({ paymentStatus: "paid", refundStatus: "pending" });
  const strapi = fakeStrapi(order);

  await assert.rejects(() => recordRefundFailure(strapi, "doc-1"), is503);
  assert.equal(strapi.updates.length, 0);
  assert.equal(order.refundStatus, "pending");
});

test("sans clé Mollie hors production, l'échec de remboursement reste enregistré", async () => {
  delete process.env.MOLLIE_API_KEY;
  const order = baseOrder({ paymentStatus: "paid", refundStatus: "pending" });
  const strapi = fakeStrapi(order);
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return mollieResponse({});
  };

  await recordRefundFailure(strapi, "doc-1");

  assert.equal(called, false);
  assert.equal(order.refundStatus, "failed");
});
