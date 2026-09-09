"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const {
  processSendcloudWebhook,
  verifySendcloudSignature,
} = require("../services/sendcloud-webhook");

const UNPARSED_BODY = Symbol.for("unparsedBody");

module.exports = createCoreController("api::order.order", ({ strapi }) => ({
  async sendcloudWebhook(ctx) {
    const secret = process.env.SENDCLOUD_SECRET_KEY;
    const signature = ctx.request.headers["sendcloud-signature"];
    const rawBody = ctx.request.body?.[UNPARSED_BODY];

    if (!secret) {
      strapi.log.error("SENDCLOUD_SECRET_KEY manque pour vérifier le webhook.");
      ctx.status = 503;
      ctx.body = { error: "Le webhook Sendcloud n'est pas configuré." };
      return;
    }
    if (!rawBody) {
      strapi.log.error("Le corps brut du webhook Sendcloud n'est pas disponible.");
      return ctx.internalServerError("Le webhook Sendcloud ne peut pas être vérifié.");
    }
    if (!verifySendcloudSignature(rawBody, signature, secret)) {
      return ctx.unauthorized("Signature Sendcloud invalide.");
    }

    try {
      const result = await processSendcloudWebhook(strapi, ctx.request.body, rawBody);
      ctx.status = 200;
      ctx.body = { received: true, ...result };
    } catch (error) {
      strapi.log.error(`Échec du webhook Sendcloud : ${error.message}`);
      return ctx.internalServerError("Le webhook Sendcloud sera retenté.");
    }
  },
}));
