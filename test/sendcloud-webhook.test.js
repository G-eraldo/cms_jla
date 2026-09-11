"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { forwardStatus } = require("../src/api/order/services/sendcloud-webhook");

test("un statut livré ne régresse pas", () => {
  assert.equal(forwardStatus("delivered", "shipped"), "delivered");
  assert.equal(forwardStatus("pending", "shipped"), "shipped");
});
