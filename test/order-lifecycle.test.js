"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const lifecycle = require("../src/api/order/content-types/order/lifecycles");

test("une erreur Resend n'annule pas la validation du paiement", async () => {
  const errors = [];
  const order = {
    documentId: "order-1",
    reference: "JLA-20260908-A62D36E8",
    firstName: "François",
    lastName: "Gerald",
    email: "client@example.com",
    addressLine1: "11 rue de la gare",
    addressLine2: null,
    postalCode: "80360",
    city: "Guillemont",
    country: "France",
    shippingAmount: 6.9,
    totalAmount: 16.9,
    paidAt: "2026-09-08T12:31:00.000Z",
    stockDecrementedAt: "2026-09-08T12:31:01.000Z",
    confirmationEmailSentAt: null,
    items: [{ productName: "Collier", quantity: 1, unitPrice: 10 }],
  };

  global.strapi = {
    documents: () => ({ findOne: async () => order }),
    plugin: () => ({
      service: () => ({ send: async () => { throw new Error("Resend indisponible"); } }),
    }),
    log: { error: (message) => errors.push(message), info: () => {} },
  };

  try {
    await assert.doesNotReject(() => lifecycle.afterUpdate({
      params: { data: { paymentStatus: "paid" }, where: { documentId: order.documentId } },
      result: order,
    }));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Resend indisponible/);
  } finally {
    delete global.strapi;
  }
});
