"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ReservationError,
  assertOrderAccess,
  assertOrderToken,
  newOrderAccessToken,
} = require("../src/api/order/services/stock-reservation");

const originalMode = process.env.ORDER_ACCESS_ENFORCEMENT;

const is403 = (error) =>
  error instanceof ReservationError && error.statusCode === 403;

test.afterEach(() => {
  if (originalMode === undefined) delete process.env.ORDER_ACCESS_ENFORCEMENT;
  else process.env.ORDER_ACCESS_ENFORCEMENT = originalMode;
});

test("le jeton de commande est aléatoire, opaque et unique", () => {
  const first = newOrderAccessToken();
  const second = newOrderAccessToken();

  assert.match(first, /^[0-9a-f]{48}$/);
  assert.notEqual(first, second);
  assert.match(second, /^[0-9a-f]{48}$/);
});

test("une commande sans jeton (créée avant le correctif) reste accessible", () => {
  process.env.ORDER_ACCESS_ENFORCEMENT = "strict";

  assert.equal(assertOrderToken({ reference: "JLA-1" }, null), true);
  assert.equal(assertOrderToken({ reference: "JLA-1", accessToken: "" }, null), true);
});

test("en mode strict, un appel sans jeton est refusé", () => {
  process.env.ORDER_ACCESS_ENFORCEMENT = "strict";

  assert.throws(
    () => assertOrderToken({ accessToken: "jeton-legitime" }, null),
    is403,
  );
  assert.throws(
    () => assertOrderToken({ accessToken: "jeton-legitime" }, "mauvais-jeton"),
    is403,
  );
});

test("en mode strict, un jeton de longueur différente est refusé sans erreur de comparaison", () => {
  process.env.ORDER_ACCESS_ENFORCEMENT = "strict";

  assert.throws(
    () => assertOrderToken({ accessToken: "abcdef" }, "abc"),
    is403,
  );
});

test("en mode strict, le jeton exact est accepté", () => {
  process.env.ORDER_ACCESS_ENFORCEMENT = "strict";
  const token = newOrderAccessToken();

  assert.equal(assertOrderToken({ accessToken: token }, token), true);
});

test("en mode compat, un jeton absent n'interrompt pas le tunnel mais est signalé", () => {
  process.env.ORDER_ACCESS_ENFORCEMENT = "compat";

  assert.equal(assertOrderToken({ accessToken: "jeton-legitime" }, null), false);
});

test("en mode off, aucun contrôle n'est appliqué", () => {
  process.env.ORDER_ACCESS_ENFORCEMENT = "off";

  assert.equal(assertOrderToken({ accessToken: "jeton-legitime" }, null), true);
});

test("le mode par défaut est compat (déploiement progressif)", () => {
  delete process.env.ORDER_ACCESS_ENFORCEMENT;

  assert.equal(assertOrderToken({ accessToken: "jeton-legitime" }, "autre"), false);
});

test("assertOrderAccess refuse une commande inexistante", async () => {
  process.env.ORDER_ACCESS_ENFORCEMENT = "strict";
  const strapi = {
    documents: () => ({ async findOne() { return null; } }),
  };

  await assert.rejects(
    () => assertOrderAccess(strapi, "doc-inexistant", "peu-importe"),
    (error) => error instanceof ReservationError && error.statusCode === 404,
  );
});

test("assertOrderAccess refuse un jeton invalide pour une commande portant un jeton", async () => {
  process.env.ORDER_ACCESS_ENFORCEMENT = "strict";
  const token = newOrderAccessToken();
  const warnings = [];
  const order = {
    documentId: "doc-1",
    reference: "JLA-20260928-ABCDEF01",
    accessToken: token,
  };
  const strapi = {
    log: { warn: (message) => warnings.push(message) },
    documents: () => ({
      async findOne() {
        return order;
      },
    }),
  };

  await assert.rejects(
    () => assertOrderAccess(strapi, "doc-1", "jeton-pris-au-hasard"),
    is403,
  );
  assert.equal(warnings.length, 0);
});

test("assertOrderAccess accepte le jeton légitime", async () => {
  process.env.ORDER_ACCESS_ENFORCEMENT = "strict";
  const token = newOrderAccessToken();
  const order = {
    documentId: "doc-1",
    reference: "JLA-20260928-ABCDEF01",
    accessToken: token,
  };
  const strapi = {
    log: { warn() {} },
    documents: () => ({
      async findOne() {
        return order;
      },
    }),
  };

  const loaded = await assertOrderAccess(strapi, "doc-1", token);

  assert.equal(loaded, order);
});

test("en mode compat, un jeton invalide est journalisé sans être bloqué", async () => {
  process.env.ORDER_ACCESS_ENFORCEMENT = "compat";
  const warnings = [];
  const order = {
    documentId: "doc-1",
    reference: "JLA-20260928-ABCDEF01",
    accessToken: newOrderAccessToken(),
  };
  const strapi = {
    log: { warn: (message) => warnings.push(message) },
    documents: () => ({
      async findOne() {
        return order;
      },
    }),
  };

  await assertOrderAccess(strapi, "doc-1", null);

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /sans jeton de commande valide/);
});
