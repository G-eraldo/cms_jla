"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  matchesOrderCustomerEmail,
} = require("../src/api/order/services/stock-reservation");

function fakeStrapi(orders) {
  const queries = [];
  return {
    queries,
    log: { error() {}, warn() {}, info() {} },
    documents() {
      return {
        async findMany({ filters, fields, limit }) {
          queries.push({ filters, fields, limit });
          const wanted = String(filters?.reference?.$eqi || "").toLowerCase();
          return orders.filter(
            (order) => String(order.reference || "").toLowerCase() === wanted,
          );
        },
      };
    },
  };
}

const order = {
  documentId: "doc-1",
  reference: "JLA-20260928-ABCDEF01",
  email: "cliente@exemple.fr",
};

test("la commande d'une autre adresse est refusée", async () => {
  const strapi = fakeStrapi([order]);

  assert.equal(
    await matchesOrderCustomerEmail(
      strapi,
      "JLA-20260928-ABCDEF01",
      "attaquant@exemple.fr",
    ),
    false,
  );
  assert.equal(strapi.queries.length, 1);
  assert.deepEqual(strapi.queries[0].fields, ["email"]);
  assert.equal(strapi.queries[0].limit, 1);
});

test("la casse et les espaces de l'adresse et de la référence sont tolérés", async () => {
  const strapi = fakeStrapi([order]);

  assert.equal(
    await matchesOrderCustomerEmail(
      strapi,
      "  jla-20260928-abcdef01 ",
      "  Cliente@Exemple.FR ",
    ),
    true,
  );
  assert.deepEqual(strapi.queries[0].filters, {
    reference: { $eqi: "JLA-20260928-ABCDEF01" },
  });
});

test("une référence inconnue ne renvoie jamais de correspondance", async () => {
  const strapi = fakeStrapi([order]);

  assert.equal(
    await matchesOrderCustomerEmail(
      strapi,
      "JLA-20260101-0000000F",
      "cliente@exemple.fr",
    ),
    false,
  );
});

test("une commande anonymisée ne correspond plus à l'adresse d'origine", async () => {
  const strapi = fakeStrapi([
    {
      documentId: "doc-2",
      reference: "JLA-20260928-ABCDEF02",
      email: "anonymized-doc-2@invalid.invalid",
    },
  ]);

  assert.equal(
    await matchesOrderCustomerEmail(
      strapi,
      "JLA-20260928-ABCDEF02",
      "cliente@exemple.fr",
    ),
    false,
  );
});

test("une demande sans adresse ou sans référence ne déclenche aucune requête", async () => {
  const strapi = fakeStrapi([order]);

  assert.equal(await matchesOrderCustomerEmail(strapi, order.reference, ""), false);
  assert.equal(await matchesOrderCustomerEmail(strapi, "", order.email), false);
  assert.equal(await matchesOrderCustomerEmail(strapi, null, null), false);
  assert.deepEqual(strapi.queries, []);
});
