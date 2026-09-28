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
  assert.match(warnings[0], /mutation sans jeton de commande valide/);
});

const controllerFactory = require("../src/api/order/controllers/order");

const ORDER_REFERENCE = "JLA-20260928-ABCDEF01";

const orderWithToken = (token) => ({
  documentId: "doc-1",
  reference: ORDER_REFERENCE,
  molliePaymentId: "tr_1",
  paymentStatus: "paid",
  accessToken: token,
});

/**
 * Faux Strapi réduit à ce dont la lecture d'une vue de commande a besoin :
 * `contentType` pour la fabrique de contrôleur, `documents` pour la vue de
 * paiement et `log` pour capturer les avertissements du mode compat.
 */
function fakeReadStrapi(order, warnings, errors) {
  return {
    contentType: () => ({ uid: "api::order.order", kind: "collectionType" }),
    log: {
      warn: (message) => warnings.push(message),
      error: (message) => errors.push(message),
    },
    documents: () => ({
      async findOne() {
        return { ...order };
      },
      async findMany() {
        return [{ ...order }];
      },
    }),
  };
}

function fakeReadContext(params, headers = {}) {
  const ctx = {
    params,
    request: { headers, body: {} },
    state: {},
    status: 200,
    notFound() {
      ctx.status = 404;
      ctx.body = { data: null };
      return ctx.body;
    },
    throw(status, message) {
      throw new ReservationError(message, status);
    },
  };
  return ctx;
}

const READ_ROUTES = [
  { name: "by-reference", handler: "findByReference", params: { reference: ORDER_REFERENCE } },
  { name: "by-payment", handler: "findByPaymentId", params: { paymentId: "tr_1" } },
  { name: "payment-view", handler: "findPaymentView", params: { documentId: "doc-1" } },
];

test("en mode compat, une lecture sans jeton est journalisée pour les trois vues de commande", async () => {
  process.env.ORDER_ACCESS_ENFORCEMENT = "compat";
  const token = newOrderAccessToken();

  for (const route of READ_ROUTES) {
    const warnings = [];
    const errors = [];
    const controller = controllerFactory({
      strapi: fakeReadStrapi(orderWithToken(token), warnings, errors),
    });

    const response = await controller[route.handler].call(
      controller,
      fakeReadContext(route.params),
    );

    assert.equal(warnings.length, 1, `${route.name} : un avertissement attendu`);
    assert.match(
      warnings[0],
      new RegExp(`${ORDER_REFERENCE} : lecture sans jeton de commande valide`),
    );
    assert.ok(
      !warnings[0].includes(token),
      `${route.name} : le jeton ne doit jamais être journalisé`,
    );
    assert.equal(response.data.reference, ORDER_REFERENCE);
    assert.equal(response.data.accessToken, undefined);
  }
});

test("en mode compat, une lecture avec un jeton erroné est journalisée sans divulguer le jeton présenté", async () => {
  process.env.ORDER_ACCESS_ENFORCEMENT = "compat";
  const warnings = [];
  const errors = [];
  const controller = controllerFactory({
    strapi: fakeReadStrapi(orderWithToken(newOrderAccessToken()), warnings, errors),
  });

  await controller.findByReference.call(
    controller,
    fakeReadContext({ reference: ORDER_REFERENCE }, { "x-order-token": "jeton-pris-au-hasard" }),
  );

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /lecture sans jeton de commande valide/);
  assert.ok(!warnings[0].includes("jeton-pris-au-hasard"));
});

test("en mode compat, une lecture avec le jeton légitime n'est pas journalisée", async () => {
  process.env.ORDER_ACCESS_ENFORCEMENT = "compat";
  const warnings = [];
  const errors = [];
  const token = newOrderAccessToken();
  const controller = controllerFactory({
    strapi: fakeReadStrapi(orderWithToken(token), warnings, errors),
  });

  await controller.findByReference.call(
    controller,
    fakeReadContext({ reference: ORDER_REFERENCE }, { "x-order-token": token }),
  );

  assert.equal(warnings.length, 0);
});

test("en mode strict, une lecture sans jeton est refusée en 403", async () => {
  process.env.ORDER_ACCESS_ENFORCEMENT = "strict";
  const warnings = [];
  const errors = [];
  const controller = controllerFactory({
    strapi: fakeReadStrapi(orderWithToken(newOrderAccessToken()), warnings, errors),
  });

  await assert.rejects(
    () =>
      controller.findByReference.call(
        controller,
        fakeReadContext({ reference: ORDER_REFERENCE }),
      ),
    is403,
  );
  assert.equal(warnings.length, 0);
});
