"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { notifyRefundCustomer } = require("../src/api/order/services/refund-email");
const { recordExternalPaymentReversal } = require("../src/api/order/services/stock-reservation");

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

test("un remboursement effectué dans Mollie déclenche le courriel client une seule fois", async () => {
  const sent = [];
  let stored = null;
  const order = {
    documentId: "order-manual", reference: "JLA-MANUAL", firstName: "Claire",
    email: "claire@example.fr", paymentStatus: "refunded", refundStatus: "refunded",
    totalAmount: "25.90", currency: "EUR"
  };
  const strapi = {
    store: () => ({ get: async () => stored, set: async ({ value }) => { stored = value; } }),
    documents: () => ({ findOne: async () => order }),
    plugin: () => ({ service: () => ({ send: async (email) => { sent.push(email); } }) })
  };
  const payment = {
    id: "tr_manual", amount: { currency: "EUR", value: "25.90" },
    amountRefunded: { currency: "EUR", value: "25.90" }
  };

  await recordExternalPaymentReversal(strapi, order, payment);
  await recordExternalPaymentReversal(strapi, order, payment);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, order.email);
});
