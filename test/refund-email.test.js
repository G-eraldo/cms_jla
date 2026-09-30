"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { notifyRefundCustomer } = require("../src/api/order/services/refund-email");

test("un remboursement confirmé envoie un seul courriel, même après rejeu", async () => {
  const sent = [];
  let stored = null;
  const strapi = {
    store: () => ({ get: async () => stored, set: async ({ value }) => { stored = value; } }),
    documents: () => ({ findOne: async () => ({
      reference: "JLA-123", firstName: "Claire", email: "claire@example.fr",
      totalAmount: "25.90", currency: "EUR"
    }) }),
    plugin: () => ({ service: () => ({ send: async (email) => { sent.push(email); } }) })
  };

  assert.equal(await notifyRefundCustomer(strapi, "order-1", 2590, "EUR"), true);
  assert.equal(await notifyRefundCustomer(strapi, "order-1", 2590, "EUR"), false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "claire@example.fr");
  assert.match(sent[0].text, /25,90/);
  assert.equal(sent[0].idempotencyKey, "customer-refund/order-1/2590");
});

test("un échec d'envoi permet une reprise sans marquer le courriel comme envoyé", async () => {
  let attempts = 0;
  let stored = null;
  const strapi = {
    store: () => ({ get: async () => stored, set: async ({ value }) => { stored = value; } }),
    documents: () => ({ findOne: async () => ({
      reference: "JLA-123", firstName: "Claire", email: "claire@example.fr",
      totalAmount: "25.90", currency: "EUR"
    }) }),
    plugin: () => ({ service: () => ({ send: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Resend indisponible");
    } }) })
  };

  await assert.rejects(() => notifyRefundCustomer(strapi, "order-2", 2590, "EUR"));
  assert.equal(stored, null);
  assert.equal(await notifyRefundCustomer(strapi, "order-2", 2590, "EUR"), true);
  assert.equal(attempts, 2);
});
