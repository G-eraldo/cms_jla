"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  classifyParcelStatus,
  forwardStatus,
  resolveNotificationType,
} = require("../src/api/order/services/sendcloud-webhook");

test("un statut livré ne régresse pas", () => {
  assert.equal(forwardStatus("delivered", "shipped"), "delivered");
  assert.equal(forwardStatus("pending", "shipped"), "shipped");
});

test("la création d’étiquette déclenche l’e-mail d’expédition", () => {
  assert.deepEqual(classifyParcelStatus({ id: 1000, message: "Ready to send" }), {
    fulfillmentStatus: "shipped",
    notificationType: "shipped",
  });
  assert.deepEqual(classifyParcelStatus({ id: 1, message: "Announced" }), {
    fulfillmentStatus: "shipped",
    notificationType: "shipped",
  });
  assert.equal(
    classifyParcelStatus({ message: "No label" }).notificationType,
    null,
  );
});

test("aucun e-mail d’expédition sans numéro de suivi", () => {
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
      { trackingNumber: "SCCWF3P8HM96" },
      { trackingEmailSentAt: "2026-09-11T10:00:00.000Z" },
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
});
