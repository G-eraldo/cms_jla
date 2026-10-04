"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  classifyParcelStatus,
  forwardStatus,
  processSendcloudWebhook,
  resolveNotificationType,
} = require("../src/api/order/services/sendcloud-webhook");

test("un statut livré ne régresse pas", () => {
  assert.equal(forwardStatus("delivered", "shipped"), "delivered");
  assert.equal(forwardStatus("pending", "shipped"), "shipped");
});

test("la création d’étiquette annonce un colis préparé, sans le déclarer expédié", () => {
  assert.deepEqual(classifyParcelStatus({ id: 1000, message: "Ready to send" }), {
    fulfillmentStatus: "processing",
    notificationType: "prepared",
  });
  assert.deepEqual(classifyParcelStatus({ id: 1, message: "Announced" }), {
    fulfillmentStatus: "processing",
    notificationType: "prepared",
  });
  assert.deepEqual(classifyParcelStatus({ message: "Printed" }), {
    fulfillmentStatus: "processing",
    notificationType: "prepared",
  });
  assert.equal(
    classifyParcelStatus({ message: "No label" }).notificationType,
    null,
  );
});

test("aucun e-mail de préparation sans numéro de suivi", () => {
  assert.equal(
    resolveNotificationType(
      { notificationType: "prepared" },
      { trackingNumber: null },
      {},
    ),
    null,
  );
  assert.equal(
    resolveNotificationType(
      { notificationType: "in_transit" },
      { trackingNumber: "SCCWF3P8HM96" },
      {},
    ),
    "shipped",
  );
  assert.equal(
    resolveNotificationType(
      { notificationType: "in_transit" },
      { trackingNumber: "73248991" },
      { shippedAt: "2026-10-04T03:49:00.000Z", trackingEmailSentAt: null },
    ),
    "shipped",
  );
  assert.equal(
    resolveNotificationType(
      { notificationType: "in_transit" },
      { trackingNumber: "SCCWF3P8HM96" },
      {
        trackingEmailSentAt: "2026-09-11T10:00:00.000Z",
        shippedAt: "2026-09-12T10:00:00.000Z",
      },
    ),
    "in_transit",
  );
});

test("un scan transporteur déclenche l’e-mail en cours de livraison", () => {
  assert.deepEqual(
    classifyParcelStatus({ id: 91, message: "Parcel en route" }),
    { fulfillmentStatus: "shipped", notificationType: "in_transit" },
  );
  assert.deepEqual(
    classifyParcelStatus({ message: "Shipment picked up by driver" }),
    { fulfillmentStatus: "shipped", notificationType: "in_transit" },
  );
  assert.deepEqual(
    classifyParcelStatus({ message: "Commande récupérée par le conducteur" }),
    { fulfillmentStatus: "shipped", notificationType: "in_transit" },
  );
});

test("le webhook envoie la préparation une seule fois puis l'expédition au premier scan", async () => {
  const order = {
    documentId: "order-1",
    reference: "JLA-20261003-TEST",
    firstName: "Ada",
    email: "ada@example.com",
    fulfillmentStatus: "pending",
  };
  const values = new Map();
  const emails = [];
  const strapi = {
    documents: () => ({
      findMany: async () => [order],
      update: async ({ data }) => Object.assign(order, data),
    }),
    store: ({ key }) => ({
      get: async () => values.get(key),
      set: async ({ value }) => values.set(key, value),
    }),
    plugin: () => ({ service: () => ({ send: async (email) => emails.push(email) }) }),
    log: { warn: () => {} },
  };
  const parcel = {
    order_number: order.reference,
    tracking_number: "73248991",
    tracking_url: `https://tracking.sendcloud.sc/forward?${"parameter=value&".repeat(20)}`,
    carrier: { name: "Mondial Relay" },
  };
  const label = {
    action: "parcel_status_changed",
    timestamp: 1791090000,
    parcel: { ...parcel, status: { id: 1000, message: "Ready to send" } },
  };
  const scan = {
    action: "parcel_status_changed",
    timestamp: 1791093600,
    parcel: { ...parcel, status: { id: 91, message: "Parcel en route" } },
  };

  const prepared = await processSendcloudWebhook(strapi, label, JSON.stringify(label));
  assert.equal(prepared.notificationSent, true);
  assert.equal(order.fulfillmentStatus, "processing");
  assert.equal(order.trackingNumber, "73248991");
  assert.equal(order.trackingUrl, undefined);
  assert.equal(order.shippedAt, undefined);
  assert.ok(order.trackingEmailSentAt);
  assert.match(emails[0].subject, /préparée/);
  assert.match(emails[0].text, /pas encore été remis au transporteur/);
  assert.match(emails[0].text, /73248991/);
  assert.match(emails[0].html, /Suivre mon colis/);
  assert.match(emails[0].html, /background:#f5eee6/);
  assert.match(emails[0].html, /Maison JLA — Julia Touret EI/);
  assert.equal(emails[0].idempotencyKey, "order-notification/order-1/prepared");

  const repeated = await processSendcloudWebhook(strapi, label, JSON.stringify(label));
  assert.equal(repeated.duplicate, true);
  assert.equal(emails.length, 1);

  const shipped = await processSendcloudWebhook(strapi, scan, JSON.stringify(scan));
  assert.equal(shipped.notificationSent, true);
  assert.equal(order.fulfillmentStatus, "shipped");
  assert.ok(order.shippedAt);
  assert.match(emails[1].subject, /expédiée/);
  assert.equal(emails[1].idempotencyKey, "order-notification/order-1/shipped");
  assert.equal(emails.length, 2);
});
