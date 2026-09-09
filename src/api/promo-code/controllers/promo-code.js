"use strict";

const { PromoCodeError, validatePromoCode } = require("../services/promo-code");

module.exports = {
  async validate(ctx) {
    try {
      const quote = await validatePromoCode(
        strapi,
        ctx.request.body?.data?.code,
        ctx.request.body?.data?.subtotalAmount,
      );
      ctx.body = { data: quote };
    } catch (error) {
      if (error instanceof PromoCodeError) return ctx.throw(error.statusCode, error.message);
      throw error;
    }
  },
};
