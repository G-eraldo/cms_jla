"use strict";

class PromoCodeError extends Error {
  constructor(message = "Ce code promo est invalide ou expiré.", statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const normalizeCode = (input) => String(input || "").trim().toUpperCase().slice(0, 40);
const toCents = (input) => Math.round(Number(input) * 100);

function promotionQuote(promotion, subtotalAmount, now = new Date()) {
  const subtotalCents = toCents(subtotalAmount);
  const value = Number(promotion?.value);
  const endsAt = new Date(promotion?.endsAt);

  if (
    !promotion ||
    !normalizeCode(promotion.code) ||
    !Number.isInteger(subtotalCents) ||
    subtotalCents < 1 ||
    !Number.isFinite(value) ||
    value <= 0 ||
    !["percentage", "fixed"].includes(promotion.kind) ||
    (promotion.kind === "percentage" && value > 100) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt.getTime() <= now.getTime()
  ) {
    throw new PromoCodeError();
  }

  const requestedDiscountCents = promotion.kind === "percentage"
    ? Math.round(subtotalCents * value / 100)
    : toCents(value);
  const discountCents = Math.min(subtotalCents, requestedDiscountCents);

  return {
    code: normalizeCode(promotion.code),
    kind: promotion.kind,
    value,
    endsAt: endsAt.toISOString(),
    discountAmount: discountCents / 100,
  };
}

async function validatePromoCode(strapi, code, subtotalAmount, now = new Date()) {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) throw new PromoCodeError();

  const promotions = await strapi.documents("api::promo-code.promo-code").findMany({
    fields: ["code", "kind", "value", "endsAt"],
    filters: { code: { $eqi: normalizedCode } },
    status: "published",
    limit: 1,
  });

  return promotionQuote(promotions[0], subtotalAmount, now);
}

module.exports = () => ({ validatePromoCode });
module.exports.PromoCodeError = PromoCodeError;
module.exports.normalizeCode = normalizeCode;
module.exports.promotionQuote = promotionQuote;
module.exports.validatePromoCode = validatePromoCode;
