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
        await releaseExpiredReservations(strapi);
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
        const pending = await strapi.documents("api::order.order").findMany({
          filters: {
            paymentStatus: "paid",
            confirmationEmailSentAt: { $null: true },
          },
          fields: ["reference"],
          limit: 10,
        });
        for (const order of pending) {
          await strapi.documents("api::order.order").update({
            documentId: order.documentId,
            data: { paymentStatus: "paid" },
          });
        }
      },
    },
  },
});
