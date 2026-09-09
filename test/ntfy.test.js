"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { notificationForOrder, notifyOrderPaid, ntfyTopicUrl } = require("../src/api/order/services/ntfy");

const order = {
  reference: "JLA-20260909-ABC12345",
  totalAmount: 27.8,
  deliveryMethod: "pickup",
  items: [{ quantity: 2 }],
};

test("prépare une notification de commande sans donnée personnelle", () => {
  assert.deepEqual(notificationForOrder(order), {
    title: "Nouvelle commande Maison JLA",
    message: "JLA-20260909-ABC12345 — 27,80 € · 2 articles · point relais",
  });
});

test("publie la notification sur le topic ntfy configuré", async () => {
  const requests = [];
  await notifyOrderPaid(order, {
    topicUrl: "https://ntfy.sh/commandes-bijoux-8f4k2p9x",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200 };
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://ntfy.sh/commandes-bijoux-8f4k2p9x");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers.Title, "Nouvelle commande Maison JLA");
  assert.equal(requests[0].options.body, "JLA-20260909-ABC12345 — 27,80 € · 2 articles · point relais");
});

test("refuse une URL de topic non sécurisée et les erreurs ntfy", async () => {
  assert.throws(() => ntfyTopicUrl("http://ntfy.sh/commandes"), /URL HTTPS/);
  await assert.rejects(
    notifyOrderPaid(order, {
      topicUrl: "https://ntfy.sh/commandes",
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    /ntfy a refusé la notification \(503\)/,
  );
});
