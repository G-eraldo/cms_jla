module.exports = ({ env }) => ({
  host: env("HOST", "0.0.0.0"),
  port: env.int("PORT", 1337),
  app: {
    keys: env.array("APP_KEYS"),
  },
  webhooks: {
    populateRelations: env.bool("WEBHOOKS_POPULATE_RELATIONS", false),
  },
  cron: {
    enabled: true,
    tasks: {
      "*/5 * * * *": async ({ strapi }) => {
        const {
          releaseExpiredReservations,
        } = require("../src/api/order/services/stock-reservation");
        const { reconcilePayments } = require("../src/api/order/services/payment-reconciliation");
        try {
          await reconcilePayments(strapi);
        } catch (error) {
          strapi.log.error(`Réconciliation Mollie : ${error.message}`);
        }
        await releaseExpiredReservations(strapi);
      },
      "30 3 * * *": async ({ strapi }) => {
        const { reconcilePayments } = require("../src/api/order/services/payment-reconciliation");
        try {
          await reconcilePayments(strapi, { deep: true });
        } catch (error) {
          strapi.log.error(`Réconciliation Mollie étendue : ${error.message}`);
        }
      },
      "15 3 * * *": async ({ strapi }) => {
        const {
          anonymizeAbandonedOrders,
        } = require("../src/api/order/services/stock-reservation");
        const count = await anonymizeAbandonedOrders(strapi);
        if (count)
          strapi.log.info(`${count} commande(s) non payée(s) anonymisée(s).`);
      },
      "*/10 * * * *": async ({ strapi }) => {
        const incomplete = [
          { confirmationEmailSentAt: { $null: true } },
          { sendcloudImportedAt: { $null: true } },
          { invoiceArchiveKey: { $null: true } },
        ];
        if (process.env.NTFY_TOPIC_URL) incomplete.push({ ntfyNotificationSentAt: { $null: true } });
        const pending = [];
        for (let start = 0; start < 10000; start += 100) {
          const page = await strapi.documents("api::order.order").findMany({
            filters: { paymentStatus: "paid", refundStatus: "not_required", $or: incomplete },
            fields: ["reference"],
            sort: ["createdAt:asc"],
            start,
            limit: 100,
          });
          pending.push(...page);
          if (page.length < 100) break;
          if (start === 9900) throw new Error("Trop de commandes avec effets secondaires incomplets.");
        }
        for (const order of pending) {
          try {
            await strapi.documents("api::order.order").update({
              documentId: order.documentId,
              data: { paymentStatus: "paid" },
            });
          } catch (error) {
            strapi.log.error(`Reprise commande ${order.reference} : ${error.message}`);
          }
        }
      },
    },
  },
});
