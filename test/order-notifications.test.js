"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildOrderNotification,
} = require("../src/api/order/services/order-notifications");

test("le mail en cours de livraison reprend le suivi Sendcloud", () => {
  const email = buildOrderNotification(
    {
      reference: "JLA-20260911-ABCDEF12",
      firstName: "Ada",
      carrier: "Mondial Relay",
      trackingNumber: "6A1234567890",
      trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis/?numero=6A1234567890",
      carrierStatus: "Parcel en route",
      deliveryMethod: "pickup",
      pickupPoint: "Relais Pressing — Doingt",
      city: "Doingt",
      postalCode: "80200",
    },
    "in_transit",
  );

  assert.match(email.subject, /en cours de livraison/);
  assert.match(email.html, /Mondial Relay/);
  assert.match(email.html, /6A1234567890/);
  assert.match(email.html, /En cours d’acheminement/);
  assert.match(email.html, /Relais Pressing/);
  assert.match(email.html, /Suivre mon colis/);
  assert.match(email.text, /6A1234567890/);
});
