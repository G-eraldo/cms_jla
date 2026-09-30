"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  attachMolliePayment,
  claimRefund,
  confirmPaidReservation,
  recordPaymentOutcome,
  recordRefund,
  verifyMolliePayment,
} = require("../src/api/order/services/stock-reservation");
const { metadataOrderId, reconcilePayment, reconcileRefund } = require("../src/api/order/services/payment-reconciliation");

function payment(id, value = "12.30", documentId = "order-1") {
  return { id, status: "paid", amount: { currency: "EUR", value }, metadata: { orderDocumentId: documentId } };
}

function fakeStrapi(order) {
  return {
    documents: () => ({ findOne: async () => ({ ...order }) }),
    db: { getConnection: () => {
      const conditions = [];
      return {
        where(value) { conditions.push(value); return this; },
        whereIn() { return this; },
        whereNull() { return this; },
        async update(values) {
          if (conditions.some((condition) => Object.entries(condition).some(([key, value]) =>
            key === "payment_status" && order.paymentStatus !== value ||
            key === "refund_status" && order.refundStatus !== value))) return 0;
          if (values.mollie_payment_id && order.molliePaymentId) return 0;
          Object.assign(order, Object.fromEntries(Object.entries(values).map(([key, value]) => [
            ({ mollie_payment_id: "molliePaymentId", payment_status: "paymentStatus", refund_status: "refundStatus", mollie_refund_id: "mollieRefundId" })[key] || key,
            value,
          ])));
          return 1;
        },
      };
    } },
  };
}

test("Mollie amount, currency and order identity must all match", async () => {
  process.env.MOLLIE_API_KEY = "test-placeholder";
  const order = { documentId: "order-1", totalAmount: "12.30", currency: "EUR" };
  const previousFetch = global.fetch;
  try {
    for (const [candidate, accepted] of [
      [payment("tr_one"), true],
      [payment("tr_one", "12.31"), false],
      [payment("tr_one", "12.30", "other-order"), false],
      [{ ...payment("tr_one"), amount: { currency: "USD", value: "12.30" } }, false],
    ]) {
      global.fetch = async () => ({ ok: true, json: async () => candidate });
      if (accepted) assert.equal((await verifyMolliePayment(order, "tr_one")).id, "tr_one");
      else await assert.rejects(() => verifyMolliePayment(order, "tr_one"), /ne correspond pas/);
    }
  } finally { global.fetch = previousFetch; }
});

test("a reservation keeps only its first verified payment", async () => {
  process.env.MOLLIE_API_KEY = "test-placeholder";
  const order = {
    documentId: "order-1", totalAmount: "12.30", currency: "EUR",
    paymentStatus: "pending", stockReservedAt: new Date().toISOString(),
  };
  const strapi = fakeStrapi(order);
  const previousFetch = global.fetch;
  global.fetch = async (url) => ({ ok: true, json: async () => payment(url.endsWith("tr_two") ? "tr_two" : "tr_one") });
  try {
    await attachMolliePayment(strapi, "order-1", "tr_one");
    await attachMolliePayment(strapi, "order-1", "tr_one");
    await assert.rejects(() => attachMolliePayment(strapi, "order-1", "tr_two"), /déjà rattaché/);
    assert.equal(order.molliePaymentId, "tr_one");
  } finally { global.fetch = previousFetch; }
});

test("terminal payment and refund states do not regress", async () => {
  const order = { paymentStatus: "paid", refundStatus: "pending" };
  const strapi = fakeStrapi(order);
  assert.equal(await recordPaymentOutcome(strapi, "order-1", "canceled"), false);
  assert.equal(order.paymentStatus, "paid");
  assert.equal(await claimRefund(strapi, "order-1"), true);
  assert.equal(await claimRefund(strapi, "order-1"), false);
  await recordRefund(strapi, "order-1", { id: "re_one", status: "refunded" });
  await recordRefund(strapi, "order-1", { id: "re_two", status: "failed" });
  assert.equal(order.refundStatus, "refunded");
  assert.equal(order.mollieRefundId, "re_one");
});

test("reconciliation records an existing refund instead of requesting a second one", async () => {
  assert.equal(metadataOrderId('{"orderDocumentId":"order-1"}'), "order-1");
  const order = { documentId: "order-1", paymentStatus: "paid", refundStatus: "processing" };
  const calls = [];
  const previousFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, method: options?.method || "GET" });
    return {
      ok: true,
      json: async () => ({ _embedded: { refunds: [{
        id: "re_existing", status: "refunded",
        amount: { currency: "EUR", value: "12.30" },
        metadata: { orderDocumentId: "order-1" },
      }] }, _links: { next: null } }),
    };
  };
  try {
    await reconcileRefund(fakeStrapi(order), order, payment("tr_one"), "test-placeholder");
    assert.equal(order.refundStatus, "refunded");
    assert.equal(order.mollieRefundId, "re_existing");
    assert.deepEqual(calls.map((call) => call.method), ["GET"]);
  } finally { global.fetch = previousFetch; }
});

test("scheduled reconciliation resumes an already claimed refund", async () => {
  process.env.MOLLIE_API_KEY = "test-placeholder";
  const order = {
    documentId: "order-1", reference: "JLA-20260928-ABCDEF12",
    molliePaymentId: "tr_one", paymentStatus: "paid", refundStatus: "processing",
    totalAmount: "12.30", currency: "EUR",
  };
  const previousFetch = global.fetch;
  global.fetch = async (url) => ({
    ok: true,
    json: async () => String(url).includes("/refunds")
      ? { _embedded: { refunds: [{
          id: "re_existing", status: "refunded", amount: { currency: "EUR", value: "12.30" },
          metadata: { orderDocumentId: "order-1" },
        }] }, _links: { next: null } }
      : payment("tr_one"),
  });
  try {
    await reconcilePayment(fakeStrapi(order), payment("tr_one"), "test-placeholder");
    assert.equal(order.refundStatus, "refunded");
  } finally { global.fetch = previousFetch; }
});

test("a stale late confirmation cannot reset a completed refund", async () => {
  process.env.MOLLIE_API_KEY = "test-placeholder";
  const current = {
    documentId: "order-1", molliePaymentId: "tr_one", paymentStatus: "paid",
    refundStatus: "refunded", stockDecrementedAt: null,
    totalAmount: "12.30", currency: "EUR",
  };
  let reads = 0;
  const stale = { ...current, paymentStatus: "expired", refundStatus: "not_required" };
  const strapi = {
    documents: () => ({ findOne: async () => ({ ...(++reads <= 2 ? stale : current) }) }),
    db: {
      transaction: async (callback) => callback({ trx: {} }),
      getConnection: () => ({
        transacting() { return this; },
        where() { return this; },
        whereIn() { return this; },
        whereNull() { return this; },
        update: async () => 0,
      }),
    },
  };
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => payment("tr_one") });
  try {
    const result = await confirmPaidReservation(strapi, "order-1");
    assert.deepEqual(result, { refundRequired: false });
    assert.equal(current.refundStatus, "refunded");
    assert.ok(reads >= 4);
  } finally { global.fetch = previousFetch; }
});
