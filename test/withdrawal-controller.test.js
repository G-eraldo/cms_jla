const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

const controllerPath = require.resolve("../src/api/withdrawal/controllers/withdrawal");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@strapi/strapi") {
    return { factories: { createCoreController: (_uid, factory) => factory } };
  }
  return originalLoad.call(this, request, parent, isMain);
};
delete require.cache[controllerPath];
const makeController = require(controllerPath);
Module._load = originalLoad;
delete require.cache[controllerPath];

const declaration = {
  firstName: "Claire",
  lastName: "Dupont",
  email: "cliente@example.fr",
  orderReference: "JLA-20260928-ABCDEF01",
  products: "Collier doré",
  orderedAt: "2026-09-01",
  receivedAt: "2026-09-05",
};

function setup() {
  const state = { record: null, creates: 0, updates: [] };
  const strapi = {
    documents: () => ({
      findMany: async () => state.record ? [{ reference: state.record.reference, documentId: state.record.documentId }] : [],
      create: async ({ data }) => {
        state.creates += 1;
        state.record = { ...data, documentId: "withdrawal-1" };
        return state.record;
      },
      update: async ({ documentId, data }) => {
        state.updates.push(data);
        state.record = { ...state.record, documentId, ...data };
        return state.record;
      },
    }),
  };
  return { state, controller: makeController({ strapi }) };
}

const context = (data, params = {}) => ({
  request: { body: { data } },
  params,
  badRequest(message) { this.status = 400; this.body = { error: message }; },
  notFound() { this.status = 404; },
});

test("submit stores the declaration but returns only its receipt", async () => {
  const { state, controller } = setup();
  const ctx = context(declaration);

  await controller.submit(ctx);

  assert.equal(ctx.status, 201);
  assert.equal(state.creates, 1);
  assert.match(state.record.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(ctx.body.data.reference, state.record.reference);
  assert.equal(ctx.body.data.documentId, "withdrawal-1");
  assert.equal("email" in ctx.body.data, false);
  assert.equal("firstName" in ctx.body.data, false);
});

test("submit is idempotent for the same normalized declaration", async () => {
  const { state, controller } = setup();
  const first = context(declaration);
  await controller.submit(first);
  const second = context({ ...declaration, email: "CLIENTE@example.fr" });

  await controller.submit(second);

  assert.equal(state.creates, 1);
  assert.equal(second.body.data.duplicate, true);
  assert.equal(second.body.data.reference, first.body.data.reference);
});

test("email-status route accepts only two booleans and writes server timestamps", async () => {
  const { state, controller } = setup();
  const invalid = context({ sellerSent: true, customerSent: true, emailStatus: "sent" }, { documentId: "withdrawal-1" });
  await controller.recordEmailStatus(invalid);
  assert.equal(invalid.status, 400);
  assert.equal(state.updates.length, 0);

  const valid = context({ sellerSent: true, customerSent: false }, { documentId: "withdrawal-1" });
  await controller.recordEmailStatus(valid);

  assert.equal(valid.status, 204);
  assert.equal(state.updates[0].emailStatus, "partially_sent");
  assert.equal(typeof state.updates[0].sellerEmailSentAt, "string");
  assert.equal("customerReceiptSentAt" in state.updates[0], false);
});
