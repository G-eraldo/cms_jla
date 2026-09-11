"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  classifyParcelStatus,
  forwardStatus,
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
