"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PromoCodeError,
  normalizeCode,
  promotionQuote,
  validatePromoCode,
} = require("../src/api/promo-code/services/promo-code");

const now = new Date("2026-09-09T12:00:00.000Z");

test("normalise un code promo saisi avec des espaces et des minuscules", () => {
  assert.equal(normalizeCode("  bienvenue10  "), "BIENVENUE10");
});

test("calcule une remise en pourcentage en centimes", () => {
  const quote = promotionQuote({
    code: "DOUZE",
    kind: "percentage",
    value: 12.5,
    endsAt: "2026-09-09T13:00:00.000Z",
  }, 19.99, now);

  assert.equal(quote.discountAmount, 2.5);
});

test("plafonne une remise fixe au sous-total", () => {
  const quote = promotionQuote({
    code: "CADEAU",
    kind: "fixed",
    value: 30,
    endsAt: "2026-09-09T13:00:00.000Z",
  }, 19.9, now);

  assert.equal(quote.discountAmount, 19.9);
});

test("refuse un code à l'instant exact de sa date de fin", () => {
  assert.throws(() => promotionQuote({
    code: "FINI",
    kind: "percentage",
    value: 10,
    endsAt: now.toISOString(),
  }, 50, now), PromoCodeError);
});

test("recherche uniquement un code publié avec des champs explicites", async () => {
  let received;
  const strapi = {
    documents(uid) {
      assert.equal(uid, "api::promo-code.promo-code");
      return {
        async findMany(params) {
          received = params;
          return [{ code: "ÉTÉ20", kind: "percentage", value: 20, endsAt: "2026-09-10T12:00:00.000Z" }];
        },
      };
    },
  };

  const quote = await validatePromoCode(strapi, " été20 ", 50, now);
  assert.equal(quote.discountAmount, 10);
  assert.deepEqual(received, {
    fields: ["code", "kind", "value", "endsAt"],
    filters: { code: { $eqi: "ÉTÉ20" } },
    status: "published",
    limit: 1,
  });
});
