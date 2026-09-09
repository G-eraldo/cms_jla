"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { validateRouteConfig } = require("../node_modules/@strapi/core/dist/services/server/routing.js");

const routeModules = [
  require("../src/api/order/routes/stock-reservation"),
  require("../src/api/promo-code/routes/promo-code"),
];

test("les routes privées utilisent une configuration d'authentification Strapi valide", () => {
  for (const routeModule of routeModules) {
    for (const route of routeModule.routes) {
      assert.notEqual(route.config?.auth, false);
      assert.doesNotThrow(() => validateRouteConfig(route));
    }
  }
});
