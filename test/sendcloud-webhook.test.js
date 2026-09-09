"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const {
  classifyParcelStatus,
  forwardStatus,
  processSendcloudWebhook,
  verifySendcloudSignature,
} = require("../src/api/order/services/sendcloud-webhook");

function createStrapiMock(initialOrder) {
  let order = { ...initialOrder };
  const emails = [];
  const updates = [];
  const stores = new Map();

  return {
    emails,
    updates,
    stores,
    log: { error() {}, info() {}, warn() {} },
    documents(uid) {
      assert.equal(uid, "api::order.order");
      return {
        async findMany() {
          return [order];
        },
        async findOne() {
          return order;
        },
        async update({ data }) {
          updates.push(data);
          order = { ...order, ...data };
          return order;
        },
      };
    },
    plugin(name) {
      assert.equal(name, "email");
      return {
        service(serviceName) {
          assert.equal(serviceName, "email");
          return {
            async send(email) {
              emails.push(email);
            },
          };
        },
      };
    },
    store({ key }) {
      return {
        async get() {
          return stores.get(key);
        },
        async set({ value }) {
          stores.set(key, value);
        },
      };
    },
  };
}

const baseOrder = {
  documentId: "order-document-1",
  reference: "JLA-20260909-ABC12345",
  firstName: "Jeanne",
  lastName: "Martin",
  email: "jeanne@example.com",
  deliveryMethod: "pickup",
  pickupPoint: "Librairie des Fleurs",
  fulfillmentStatus: "processing",
  trackingEmailSentAt: null,
};

function webhook(status, overrides = {}) {
  return {
    action: "parcel_status_changed",
    timestamp: 1788948000,
    parcel: {
      id: 42,
      order_number: baseOrder.reference,
      tracking_number: "8M123456789",
      tracking_url: "https://tracking.sendcloud.sc/parcel/8M123456789",
      shipment: { name: "Mondial Relay" },
      status,
      ...overrides,
    },
  };
}

test("vérifie la signature HMAC Sendcloud sans comparaison fragile", () => {
  const rawBody = Buffer.from('{"action":"parcel_status_changed"}');
  const signature = crypto.createHmac("sha256", "secret").update(rawBody).digest("hex");

  assert.equal(verifySendcloudSignature(rawBody, signature, "secret"), true);
  assert.equal(verifySendcloudSignature(rawBody, "0".repeat(64), "secret"), false);
  assert.equal(verifySendcloudSignature(rawBody, "invalide", "secret"), false);
});

test("classe uniquement les étapes qui justifient un e-mail client", () => {
  assert.deepEqual(classifyParcelStatus({ id: 1000, message: "Ready to send" }), {
    fulfillmentStatus: "processing",
    notificationType: null,
  });
  assert.equal(
    classifyParcelStatus({ message: "Shipment picked up by driver" }).notificationType,
    "shipped",
  );
  assert.equal(classifyParcelStatus({ id: 4, message: "Delivery delayed" }).notificationType, "delayed");
  assert.equal(
    classifyParcelStatus({ message: "Awaiting customer pickup" }).notificationType,
    "pickup",
  );
  assert.equal(classifyParcelStatus({ id: 11, message: "Delivered" }).notificationType, "delivered");
});

test("ne fait jamais régresser un statut final", () => {
  assert.equal(forwardStatus("delivered", "shipped"), "delivered");
  assert.equal(forwardStatus("shipped", "processing"), "shipped");
  assert.equal(forwardStatus("processing", "shipped"), "shipped");
});

test("met à jour Strapi et envoie l'expédition une seule fois malgré un webhook rejoué", async () => {
  const strapi = createStrapiMock(baseOrder);
  const payload = webhook({ id: 8, message: "Shipment picked up by driver" });
  const rawBody = Buffer.from(JSON.stringify(payload));

  const first = await processSendcloudWebhook(strapi, payload, rawBody);
  const second = await processSendcloudWebhook(strapi, payload, rawBody);

  assert.equal(first.fulfillmentStatus, "shipped");
  assert.equal(first.notificationSent, true);
  assert.deepEqual(second, { duplicate: true });
  assert.equal(strapi.emails.length, 1);
  assert.match(strapi.emails[0].subject, /est expédiée/);
  assert.ok(strapi.updates.some((update) => update.trackingNumber === "8M123456789"));
  assert.ok(strapi.updates.some((update) => update.trackingEmailSentAt));
});

test("ignore une ancienne alerte après la livraison", async () => {
  const strapi = createStrapiMock({ ...baseOrder, fulfillmentStatus: "delivered" });
  const payload = webhook({ id: 4, message: "Delivery delayed" });

  const result = await processSendcloudWebhook(
    strapi,
    payload,
    Buffer.from(JSON.stringify(payload)),
  );

  assert.equal(result.fulfillmentStatus, "delivered");
  assert.equal(result.notificationSent, false);
  assert.equal(strapi.emails.length, 0);
});

test("accepte le webhook de test signé sans chercher une commande", async () => {
  const strapi = createStrapiMock(baseOrder);
  const payload = { action: "integration_updated", timestamp: 1788948000 };

  const result = await processSendcloudWebhook(
    strapi,
    payload,
    Buffer.from(JSON.stringify(payload)),
  );

  assert.deepEqual(result, { ignored: true, action: "integration_updated" });
  assert.equal(strapi.emails.length, 0);
});
