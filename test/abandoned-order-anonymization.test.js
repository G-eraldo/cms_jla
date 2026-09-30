"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { anonymizeAbandonedOrders } = require("../src/api/order/services/stock-reservation");

function abandonedOrder(index, { anonymized = false, paymentStatus = "pending", recent = false } = {}) {
  return {
    documentId: `order-${String(index).padStart(3, "0")}`,
    email: anonymized ? `anonymized-order-${index}@invalid.invalid` : `client-${index}@example.fr`,
    paymentStatus,
    createdAt: recent
      ? new Date().toISOString()
      : new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function fakeStrapi(orders) {
  const updates = [];
  const errors = [];
  const queries = [];
  return {
    updates,
    errors,
    queries,
    log: { error(message) { errors.push(message); } },
    documents() {
      return {
        async findMany(query) {
          queries.push(query);
          return orders
            .filter((order) => ["pending", "failed", "canceled", "expired"].includes(order.paymentStatus))
            .filter((order) => new Date(order.createdAt) < new Date(query.filters.createdAt.$lt))
            .filter((order) => !query.filters.$or || query.filters.$or.some(({ email }) => email.$null ? order.email == null : !String(order.email || "").endsWith(email.$not.$endsWith)))
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.documentId.localeCompare(right.documentId))
            .slice(0, query.limit);
        },
        async findOne() { return null; },
        async update({ documentId, data }) {
          updates.push({ documentId, data });
          Object.assign(orders.find((order) => order.documentId === documentId), data);
        },
      };
    },
    db: {},
  };
}

test("anonymise plus de 50 commandes sans sauter celles qui deviennent inéligibles", async () => {
  const orders = [
    ...Array.from({ length: 60 }, (_, index) => abandonedOrder(index - 100, { anonymized: true })),
    ...Array.from({ length: 75 }, (_, index) => abandonedOrder(index + 1)),
    abandonedOrder(76, { anonymized: true }),
    abandonedOrder(77, { paymentStatus: "paid" }),
    abandonedOrder(78, { recent: true }),
  ];
  const strapi = fakeStrapi(orders);

  assert.equal(await anonymizeAbandonedOrders(strapi), 75);
  assert.equal(strapi.updates.length, 75);
  assert.equal(new Set(strapi.updates.map(({ documentId }) => documentId)).size, 75);
  assert.equal(orders.find((order) => order.documentId === "order-076").email, "anonymized-order-76@invalid.invalid");
  assert.equal(orders.find((order) => order.documentId === "order-077").email, "client-77@example.fr");
  assert.equal(orders.find((order) => order.documentId === "order-078").email, "client-78@example.fr");
  assert.ok(strapi.queries.every((query) => query.filters.$or));
  assert.ok(strapi.queries.every((query) => query.sort.join(",") === "createdAt:asc,documentId:asc"));
});

test("signale le reliquat lorsque la borne d'anonymisation est atteinte", async () => {
  const strapi = fakeStrapi(Array.from({ length: 501 }, (_, index) => abandonedOrder(index + 1)));

  assert.equal(await anonymizeAbandonedOrders(strapi), 500);
  assert.equal(strapi.errors.length, 1);
  assert.match(strapi.errors[0], /limite de 500 atteinte/);
});
