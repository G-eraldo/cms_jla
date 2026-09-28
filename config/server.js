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
        // Reprise bornée : sans plafond, une commande dont l'e-mail de
        // confirmation échoue était retraitée à chaque passage, régénérant
        // facture, e-mail, notification et import Sendcloud indéfiniment.
        const MAX_ATTEMPTS = 5;
        const retryStore = strapi.store({
          type: "plugin",
          name: "maison-jla-confirmation-retry",
        });
        const pending = await strapi.documents("api::order.order").findMany({
          filters: {
            paymentStatus: "paid",
            confirmationEmailSentAt: { $null: true },
          },
          fields: ["reference"],
          limit: 10,
        });
        for (const order of pending) {
          const key = order.documentId;
          const previous = (await retryStore.get({ key })) || { attempts: 0 };
          if (previous.attempts >= MAX_ATTEMPTS) {
            if (!previous.exhausted) {
              strapi.log.error(
                `Commande ${order.reference} : confirmation toujours non envoyée après ${previous.attempts} tentatives, reprise arrêtée.`,
              );
              await retryStore.set({
                key,
                value: { ...previous, exhausted: true },
              });
            }
            continue;
          }
          await retryStore.set({
            key,
            value: {
              attempts: previous.attempts + 1,
              lastAttemptAt: new Date().toISOString(),
            },
          });
          await strapi.documents("api::order.order").update({
            documentId: order.documentId,
            data: { paymentStatus: "paid" },
          });
          const updated = await strapi.documents("api::order.order").findOne({
            documentId: order.documentId,
            fields: ["confirmationEmailSentAt"],
          });
          if (updated?.confirmationEmailSentAt) {
            await retryStore.set({
              key,
              value: {
                attempts: 0,
                sentAt: updated.confirmationEmailSentAt,
              },
            });
          }
        }
      },
    },
  },
});
