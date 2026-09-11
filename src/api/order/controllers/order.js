"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const {
  processSendcloudWebhook,
  verifySendcloudSignature,
} = require("../services/sendcloud-webhook");
const {
  ReservationError,
  attachMolliePayment,
  confirmPaidReservation,
  findPaymentView: loadPaymentView,
  recordPaymentOutcome,
  recordRefund,
  recordRefundFailure,
  releaseReservation,
  reserveOrder,
} = require("../services/stock-reservation");

const UNPARSED_BODY = Symbol.for("unparsedBody");

module.exports = createCoreController("api::order.order", ({ strapi }) => ({
  async reserve(ctx) {
    try {
      const order = await reserveOrder(strapi, ctx.request.body?.data);
      ctx.status = 201;
      return this.transformResponse(order);
    } catch (error) {
      if (error instanceof ReservationError)
        return ctx.throw(error.statusCode, error.message);
      throw error;
    }
  },

  async attachPayment(ctx) {
    try {
      await attachMolliePayment(
        strapi,
        ctx.params.documentId,
        ctx.request.body?.data?.molliePaymentId,
      );
      ctx.status = 204;
    } catch (error) {
      if (error instanceof ReservationError)
        return ctx.throw(error.statusCode, error.message);
      throw error;
    }
  },

  async releaseReservation(ctx) {
    try {
      await releaseReservation(strapi, ctx.params.documentId);
      ctx.status = 204;
    } catch (error) {
      if (error instanceof ReservationError)
        return ctx.throw(error.statusCode, error.message);
      throw error;
    }
  },

  async confirmPaidReservation(ctx) {
    try {
      const result = await confirmPaidReservation(
        strapi,
        ctx.params.documentId,
        ctx.request.body?.data?.paidAt,
      );
      ctx.body = { data: result };
    } catch (error) {
      if (error instanceof ReservationError)
        return ctx.throw(error.statusCode, error.message);
      throw error;
    }
  },

  async recordRefund(ctx) {
    try {
      await recordRefund(
        strapi,
        ctx.params.documentId,
        ctx.request.body?.data?.refund,
      );
      ctx.status = 204;
    } catch (error) {
      if (error instanceof ReservationError)
        return ctx.throw(error.statusCode, error.message);
      throw error;
    }
  },

  async recordRefundFailure(ctx) {
    try {
      await recordRefundFailure(strapi, ctx.params.documentId);
      ctx.status = 204;
    } catch (error) {
      if (error instanceof ReservationError)
        return ctx.throw(error.statusCode, error.message);
      throw error;
    }
  },

  async recordPaymentOutcome(ctx) {
    try {
      await recordPaymentOutcome(
        strapi,
        ctx.params.documentId,
        ctx.request.body?.data?.paymentStatus,
      );
      ctx.status = 204;
    } catch (error) {
      if (error instanceof ReservationError)
        return ctx.throw(error.statusCode, error.message);
      throw error;
    }
  },

  async findByReference(ctx) {
    const order = await loadPaymentView(strapi, {
      reference: ctx.params.reference,
    });
    if (!order) return ctx.notFound();
    return this.transformResponse(order);
  },

  async findByPaymentId(ctx) {
    const order = await loadPaymentView(strapi, {
      molliePaymentId: ctx.params.paymentId,
    });
    if (!order) return ctx.notFound();
    return this.transformResponse(order);
  },

  async findPaymentView(ctx) {
    const order = await loadPaymentView(strapi, {
      documentId: ctx.params.documentId,
    });
    if (!order) return ctx.notFound();
    return this.transformResponse(order);
  },

  async find(ctx) {
    return ctx.forbidden();
  },
  async findOne(ctx) {
    return ctx.forbidden();
  },
  async create(ctx) {
    return ctx.forbidden();
  },
  async update(ctx) {
    return ctx.forbidden();
  },
  async delete(ctx) {
    return ctx.forbidden();
  },

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
      strapi.log.error(
        "Le corps brut du webhook Sendcloud n'est pas disponible.",
      );
      return ctx.internalServerError(
        "Le webhook Sendcloud ne peut pas être vérifié.",
      );
    }
    if (!verifySendcloudSignature(rawBody, signature, secret)) {
      return ctx.unauthorized("Signature Sendcloud invalide.");
    }

    try {
      const result = await processSendcloudWebhook(
        strapi,
        ctx.request.body,
        rawBody,
      );
      ctx.status = 200;
      ctx.body = { received: true, ...result };
    } catch (error) {
      strapi.log.error(`Échec du webhook Sendcloud : ${error.message}`);
      return ctx.internalServerError("Le webhook Sendcloud sera retenté.");
    }
  },
}));
