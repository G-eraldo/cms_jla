"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  SENDCLOUD_ORDERS_URL,
  buildSendcloudOrder,
  splitAddress,
  syncOrderToSendcloud,
} = require("../src/api/order/services/sendcloud");

const order = {
  documentId: "order-document-1",
  reference: "JLA-20260908-ABC12345",
  firstName: "Jeanne",
  lastName: "Martin",
  email: "jeanne@example.com",
  phone: "+33612345678",
  addressLine1: "12 bis rue des Fleurs",
  addressLine2: "Appartement 3",
  postalCode: "75001",
  city: "Paris",
  country: "France",
  deliveryMethod: "home",
  currency: "EUR",
  shippingAmount: 7.9,
  totalAmount: 27.8,
  createdAt: "2026-09-08T10:00:00.000Z",
  paidAt: "2026-09-08T10:05:00.000Z",
  items: [
    {
      productName: "Boucles Alba",
      unitPrice: 19.9,
      quantity: 1,
    },
  ],
};

test("sépare le numéro de voie pour l'adresse Sendcloud", () => {
  assert.deepEqual(splitAddress("12 bis rue des Fleurs"), {
    address_line_1: "rue des Fleurs",
    house_number: "12 bis",
  });
  assert.deepEqual(splitAddress("Lieu-dit Les Fleurs"), {
    address_line_1: "Lieu-dit Les Fleurs",
  });
});

test("construit une commande Sendcloud payée à domicile", () => {
  const payload = buildSendcloudOrder(order, "42");

  assert.equal(payload.order_id, order.documentId);
  assert.equal(payload.order_number, order.reference);
  assert.equal(payload.order_details.integration.id, 42);
  assert.equal(payload.payment_details.total_price.value, 27.8);
  assert.equal(payload.payment_details.freight_costs.value, 7.9);
  assert.equal(payload.order_details.order_items[0].unit_price.value, 19.9);
  assert.equal(payload.shipping_address.house_number, "12 bis");
  assert.equal(payload.shipping_address.country_code, "FR");
  assert.equal(payload.service_point_details, undefined);
});

test("joint le point relais Sendcloud à une commande pickup", () => {
  const payload = buildSendcloudOrder(
    { ...order, deliveryMethod: "pickup", pickupPointId: "10168633" },
    42,
  );

  assert.deepEqual(payload.service_point_details, { id: "10168633" });
  assert.match(payload.shipping_details.delivery_indicator, /Mondial Relay/);
});

test("importe avec Basic Auth et un identifiant stable pour les relances", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 201,
      json: async () => ({
        data: [{ id: 664, order_id: order.documentId, order_number: order.reference }],
      }),
    };
  };

  await syncOrderToSendcloud(order, {
    publicKey: "public",
    secretKey: "secret",
    integrationId: "42",
    fetchImpl,
  });
  await syncOrderToSendcloud(order, {
    publicKey: "public",
    secretKey: "secret",
    integrationId: "42",
    fetchImpl,
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, SENDCLOUD_ORDERS_URL);
  assert.equal(requests[0].options.headers.Authorization, "Basic cHVibGljOnNlY3JldA==");
  assert.equal(JSON.parse(requests[0].options.body)[0].order_id, order.documentId);
  assert.equal(JSON.parse(requests[1].options.body)[0].order_id, order.documentId);
});
