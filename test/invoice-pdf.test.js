"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createInvoicePdf, invoiceSnapshot } = require("../src/api/order/services/invoice");
const { pdfHash } = require("../src/api/order/services/invoice-archive");

const order = {
  reference: "JLA-20260911-ABCDEF12",
  invoiceNumber: "FAC-2026-000001",
  invoiceIssuedAt: "2026-09-11T10:00:00.000Z",
  paidAt: "2026-09-11T10:00:00.000Z",
  firstName: "Ada",
  lastName: "Lovelace",
  addressLine1: "5 Rue Joliot-Curie",
  postalCode: "80200",
  city: "Doingt",
  country: "France",
  items: [{ productName: "Collier", quantity: 1, unitPrice: 34 }],
  subtotalAmount: 34,
  discountAmount: 0,
  shippingAmount: 3.9,
  totalAmount: 37.9,
};

test("génère un PDF identique depuis le même instantané", async () => {
  const snapshot = invoiceSnapshot(order);
  const first = await createInvoicePdf({ ...order, invoiceSnapshot: snapshot });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const second = await createInvoicePdf({
    ...order,
    firstName: "Autre",
    invoiceSnapshot: snapshot,
  });
  assert.equal(pdfHash(first), pdfHash(second));
  assert.equal(snapshot.seller.address.includes("Doingt"), true);
});
