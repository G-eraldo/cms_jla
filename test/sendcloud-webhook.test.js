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

test("la création d’étiquette ne déclenche aucun e-mail", () => {
  assert.deepEqual(classifyParcelStatus({ id: 1000, message: "Ready to send" }), {
    fulfillmentStatus: "processing",
    notificationType: null,
  });
  assert.deepEqual(classifyParcelStatus({ id: 1, message: "Announced" }), {
    fulfillmentStatus: "processing",
    notificationType: null,
  });
  assert.deepEqual(classifyParcelStatus({ message: "Printed" }), {
    fulfillmentStatus: "processing",
    notificationType: null,
  });
  assert.equal(
    classifyParcelStatus({ message: "No label" }).notificationType,
    null,
  );
});

test("aucun e-mail d'expédition sans numéro de suivi", () => {
  assert.equal(
    resolveNotificationType(
      { notificationType: "shipped" },
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

test("le scan de prise en charge déclenche seulement l'e-mail en route", () => {
  assert.deepEqual(
    classifyParcelStatus({ id: 91, message: "Parcel en route" }),
    { fulfillmentStatus: "shipped", notificationType: "shipped" },
  );
  assert.deepEqual(
    classifyParcelStatus({ message: "Shipment picked up by driver" }),
    { fulfillmentStatus: "shipped", notificationType: "shipped" },
  );
  assert.deepEqual(
    classifyParcelStatus({ message: "Commande récupérée par le conducteur" }),
    { fulfillmentStatus: "shipped", notificationType: "shipped" },
  );
});

test("le point relais de destination ne signifie pas que le colis y est disponible", () => {
  assert.notEqual(
    classifyParcelStatus({ message: "En route vers le centre de tri, point relais destinataire" }).notificationType,
    "pickup",
  );
  assert.deepEqual(classifyParcelStatus({ message: "Colis en route vers le point de livraison" }), {
    fulfillmentStatus: "shipped",
    notificationType: "in_transit",
  });
  assert.deepEqual(classifyParcelStatus({ message: "Colis disponible au point de retrait" }), {
    fulfillmentStatus: "shipped",
    notificationType: "pickup",
  });
  assert.deepEqual(classifyParcelStatus({ message: "Awaiting customer pickup" }), {
    fulfillmentStatus: "shipped",
    notificationType: "pickup",
  });
  assert.equal(classifyParcelStatus({ message: "At sorting centre" }).notificationType, "shipped");
  assert.equal(classifyParcelStatus({ message: "Delivery delayed" }).notificationType, null);
  assert.equal(classifyParcelStatus({ message: "Unable to deliver" }).notificationType, null);
  assert.equal(classifyParcelStatus({ id: 11, message: "Delivered" }).notificationType, null);
});

test("le webhook envoie seulement les trois e-mails de suivi, dans l'ordre et une fois chacun", async () => {
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
  const approach = {
    action: "parcel_status_changed",
    timestamp: 1791097200,
    parcel: { ...parcel, status: { id: 91, message: "Colis en route vers le point de livraison" } },
  };
  const available = {
    action: "parcel_status_changed",
    timestamp: 1791100800,
    parcel: { ...parcel, status: { message: "Colis disponible au point de retrait" } },
  };

  const prepared = await processSendcloudWebhook(strapi, label, JSON.stringify(label));
  assert.equal(prepared.notificationSent, false);
  assert.equal(order.fulfillmentStatus, "processing");
  assert.equal(order.trackingNumber, "73248991");
  assert.equal(order.trackingUrl, undefined);
  assert.equal(order.shippedAt, undefined);
  assert.equal(order.trackingEmailSentAt, undefined);
  assert.equal(emails.length, 0);

  const repeated = await processSendcloudWebhook(strapi, label, JSON.stringify(label));
  assert.equal(repeated.duplicate, true);
  assert.equal(emails.length, 0);

  const shipped = await processSendcloudWebhook(strapi, scan, JSON.stringify(scan));
  assert.equal(shipped.notificationSent, true);
  assert.equal(order.fulfillmentStatus, "shipped");
  assert.ok(order.shippedAt);
  assert.match(emails[0].subject, /expédiée/);
  assert.equal(emails[0].idempotencyKey, "order-notification/order-1/shipped");
  assert.equal(emails.length, 1);
  assert.ok(order.trackingEmailSentAt);

  await processSendcloudWebhook(strapi, approach, JSON.stringify(approach));
  assert.match(emails[1].subject, /en cours de livraison/);
  assert.equal(emails[1].idempotencyKey, "order-notification/order-1/in_transit");

  const repeatedApproach = { ...approach, timestamp: 1791099000 };
  await processSendcloudWebhook(strapi, repeatedApproach, JSON.stringify(repeatedApproach));
  assert.equal(emails.length, 2);

  await processSendcloudWebhook(strapi, available, JSON.stringify(available));
  assert.match(emails[2].subject, /arrivée au point relais/);
  assert.equal(emails[2].idempotencyKey, "order-notification/order-1/pickup");
  assert.equal(emails.length, 3);

  const lateApproach = { ...approach, timestamp: 1791102600 };
  await processSendcloudWebhook(strapi, lateApproach, JSON.stringify(lateApproach));
  assert.equal(emails.length, 3);

  const collected = {
    action: "parcel_status_changed",
    timestamp: 1791104400,
    parcel: { ...parcel, status: { id: 11, message: "Shipment collected by customer" } },
  };
  await processSendcloudWebhook(strapi, collected, JSON.stringify(collected));
  assert.equal(order.fulfillmentStatus, "delivered");
  assert.equal(emails.length, 3);
});
