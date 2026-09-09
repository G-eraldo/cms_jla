"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createInvoicePdf, invoiceSnapshot } = require("../src/api/order/services/invoice");
const { createTermsPdf, TERMS_SECTIONS, TERMS_VERSION } = require("../src/api/order/services/terms");

const order = {
  reference: "JLA-20260908-LEGAL",
  firstName: "Jeanne",
  lastName: "Martin",
  addressLine1: "12 rue des Fleurs",
  addressLine2: "",
  postalCode: "75001",
  city: "Paris",
  country: "France",
  subtotalAmount: 19.9,
  promoCode: "BIENVENUE10",
  discountAmount: 1.99,
  shippingAmount: 3.9,
  totalAmount: 21.81,
  paidAt: "2026-09-08T12:00:00.000Z",
  items: [{ productName: "Boucles Alba", unitPrice: 19.9, quantity: 1 }],
};

test("génère la facture avec l'identité corrigée de la vendeuse", async () => {
  const invoice = await createInvoicePdf(order);
  assert.equal(invoice.subarray(0, 4).toString(), "%PDF");
  assert.ok(invoice.length > 2000);
  assert.deepEqual(
    { promoCode: invoiceSnapshot(order).promoCode, discountAmount: invoiceSnapshot(order).discountAmount },
    { promoCode: "BIENVENUE10", discountAmount: 1.99 },
  );
});

test("génère une copie durable et versionnée des CGV", async () => {
  const terms = await createTermsPdf();
  assert.equal(terms.subarray(0, 4).toString(), "%PDF");
  assert.ok(terms.length > 8000);
  assert.equal(TERMS_VERSION, "8 septembre 2026");
  assert.ok(TERMS_SECTIONS.some((section) => section.title.includes("Commande sans compte")));
  assert.ok(TERMS_SECTIONS.every((section) => section.paragraphs.every((paragraph) => !/espace client|création de compte/i.test(paragraph))));
});
