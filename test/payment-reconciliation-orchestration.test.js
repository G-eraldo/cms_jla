"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { reconcilePayments } = require("../src/api/order/services/payment-reconciliation");

function fakeStrapi(order) {
  const queries = [];
  const updates = [];
  const logs = [];
  return {
    queries,
    updates,
    logs,
    log: { info(message) { logs.push(message); }, error(message) { logs.push(message); } },
    documents() {
      return {
        async findMany(query) {
          queries.push(query);
          const includesAllPaid = query.filters.$or.some((item) => item.paymentStatus === "paid" && !item.refundStatus);
          return includesAllPaid ? [order] : [];
        },
        async findOne() { return { ...order }; },
      };
    },
    db: {
      getConnection() {
        return {
          where() { return this; },
          whereIn() { return this; },
          whereNot() { return this; },
          update: async (data) => { updates.push(data); return 1; },
        };
      },
    },
  };
}

async function withFetch(callback) {
  const previousFetch = global.fetch;
  global.fetch = async (url) => ({
    ok: true,
    json: async () => String(url).includes("/payments?")
      ? { _embedded: { payments: [] }, _links: { next: null } }
      : {
          id: "tr_oldrefund", status: "paid",
          amount: { currency: "EUR", value: "12.30" },
          amountRefunded: { currency: "EUR", value: "12.30" },
          metadata: { orderDocumentId: "order-old" },
        },
  });
  try { await callback(); } finally { global.fetch = previousFetch; }
}

test("le passage normal conserve sa sélection ciblée, le passage deep inclut les commandes payées", async () => {
  process.env.MOLLIE_API_KEY = "test-placeholder";
  const order = {
    documentId: "order-old", reference: "JLA-20250101-ABCDEF12", molliePaymentId: "tr_oldrefund",
    paymentStatus: "paid", refundStatus: "not_required", totalAmount: "12.30", currency: "EUR",
  };

  const normal = fakeStrapi(order);
  await withFetch(() => reconcilePayments(normal));
  assert.equal(normal.updates.length, 0);
  assert.equal(normal.queries[0].filters.$or.some((item) => item.paymentStatus === "paid" && !item.refundStatus), false);

  const deep = fakeStrapi(order);
  await withFetch(() => reconcilePayments(deep, { deep: true }));
  assert.equal(deep.queries[0].filters.$or.some((item) => item.paymentStatus === "paid" && !item.refundStatus), true);
  assert.match(deep.logs[0], /sans limite d'ancienneté/);
});

test("le passage deep rattrape le remboursement externe d'une commande de plus de 35 jours", async () => {
  process.env.MOLLIE_API_KEY = "test-placeholder";
  const order = {
    documentId: "order-old", reference: "JLA-20250101-ABCDEF12", molliePaymentId: "tr_oldrefund",
    paymentStatus: "paid", refundStatus: "not_required", totalAmount: "12.30", currency: "EUR",
    createdAt: new Date(Date.now() - 36 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const strapi = fakeStrapi(order);

  await withFetch(() => reconcilePayments(strapi, { deep: true }));
  assert.ok(!strapi.logs.some(message => message.startsWith("Réconciliation JLA")));
  assert.ok(strapi.updates.some((update) => update.refund_status === "refunded"));
  assert.equal(strapi.queries[0].filters.createdAt, undefined);
});


test("le passage deep poursuit la sélection au-delà de 10 000 commandes historiques", async () => {
  process.env.MOLLIE_API_KEY = "test-placeholder";
  const strapi = fakeStrapi({});
  const starts = [];
  strapi.documents = () => ({
    async findMany({ start, limit }) {
      starts.push(start);
      // Sans identifiant de paiement : isole la pagination, sans opérations financières.
      return Array.from({ length: Math.min(limit, 10001 - start) }, (_, index) => ({ documentId: `order-${start + index}` }));
    },
  });
  await withFetch(() => reconcilePayments(strapi, { deep: true }));
  assert.equal(starts.length, 101);
  assert.equal(starts.at(-1), 10000);
});
