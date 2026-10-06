"use strict";

const crypto = require("node:crypto");
const { sendOrderNotification } = require("./order-notifications");

const ORDER_FIELDS = [
  "reference",
  "firstName",
  "lastName",
  "email",
  "city",
  "postalCode",
  "deliveryMethod",
  "pickupPoint",
  "fulfillmentStatus",
  "trackingNumber",
  "trackingUrl",
  "carrier",
  "shippedAt",
  "trackingEmailSentAt",
  "lastCarrierEventAt",
];

const eventsInFlight = new Set();
const ordersNotifying = new Set();

const STATUS_RANK = {
  pending: 0,
  processing: 1,
  shipped: 2,
  delivered: 3,
  canceled: 3,
};

function verifySendcloudSignature(rawBody, signature, secret) {
  if (!secret || !/^[a-f\d]{64}$/i.test(String(signature || ""))) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(String(signature), "hex"),
  );
}

function normalizeStatus(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

function classifyParcelStatus(status = {}) {
  const id = Number(status.id);
  const label = normalizeStatus(`${status.code || ""} ${status.message || ""}`);

  if (
    /awaiting customer pickup|ready (for|at) (customer )?(pick ?up|collection)|available (at|for collection at) (the )?(pick ?up|service) point|(?:colis )?disponible (?:au|en) point (?:de retrait|relais)|delivered to (the |a )?(pick ?up|service) point|livre au point (de retrait|relais)/.test(
      label,
    )
  ) {
    return { fulfillmentStatus: "shipped", notificationType: "pickup" };
  }
  if (id === 11 || /delivered|shipment collected by customer|livre/.test(label)) {
    return { fulfillmentStatus: "delivered", notificationType: "delivered" };
  }
  if (id === 4 || /delay|retard/.test(label)) {
    return { fulfillmentStatus: "shipped", notificationType: null };
  }
  if (
    /unable to deliver|address invalid|not accessible|no one home|exception|refused by recipient|echec de livraison|announced:? not collected/.test(
      label,
    )
  ) {
    return { fulfillmentStatus: "shipped", notificationType: null };
  }
  if (
    /colis en route vers le point de livraison|(?:out for delivery|driver en route|in delivery|en cours de livraison)/.test(label)
  ) {
    return { fulfillmentStatus: "shipped", notificationType: "in_transit" };
  }
  if (
    id === 3 ||
    id === 5 ||
    id === 7 ||
    id === 22 ||
    id === 91 ||
    id === 92 ||
    /picked up by driver|commande recuperee par le conducteur|shipment on route|parcel en route|en route|in transit|sorting cent(re|er)|sorted|on its way|expedie|colis remis a mondial relay|prise en charge/.test(
      label,
    )
  ) {
    return { fulfillmentStatus: "shipped", notificationType: "shipped" };
  }
  // A generated label does not mean the parcel has been handed to the carrier.
  if (
    id === 1 ||
    id === 1000 ||
    id === 1002 ||
    /ready to send|announced at carrier|label (created|printed)|printed|imprime|etiquette/.test(
      label,
    ) ||
    /(^| )announced( |$)/.test(label)
  ) {
    return { fulfillmentStatus: "processing", notificationType: null };
  }
  if (
    id === 1001 ||
    /no label|preparation|being announced|ready to process/.test(label)
  ) {
    return { fulfillmentStatus: "processing", notificationType: null };
  }
  return { fulfillmentStatus: null, notificationType: null };
}

function resolveNotificationType(status, tracking, order) {
  let type = status?.notificationType || null;
  const hasTracking = Boolean(tracking?.trackingNumber);
  if ((type === "shipped" || type === "in_transit") && !hasTracking) return null;
  if (type === "in_transit" && (!order?.shippedAt || !order?.trackingEmailSentAt)) return "shipped";
  return type;
}

function eventDate(payload) {
  const value = payload.carrier_status_change_timestamp || payload.timestamp;
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return new Date().toISOString();
  return new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp).toISOString();
}

function forwardStatus(current, next) {
  if (!next) return current;
  if ((STATUS_RANK[next] ?? 0) < (STATUS_RANK[current] ?? 0)) return current;
  if (current === "delivered" || current === "canceled") return current;
  return next;
}

function storeFor(strapi, key) {
  return strapi.store({ type: "plugin", name: "maison-jla-sendcloud", key });
}

async function findOrder(strapi, parcel) {
  if (parcel.order_number) {
    const orders = await strapi.documents("api::order.order").findMany({
      filters: { reference: parcel.order_number },
      fields: ORDER_FIELDS,
      limit: 1,
    });
    if (orders[0]) return orders[0];
  }

  if (parcel.external_order_id) {
    return strapi.documents("api::order.order").findOne({
      documentId: String(parcel.external_order_id),
      fields: ORDER_FIELDS,
    });
  }
  return null;
}

function parcelTrackingUrl(parcel) {
  return [parcel.sendcloud_tracking_url, parcel.tracking_url].find(
    (value) => typeof value === "string" && /^https:\/\//i.test(value),
  );
}

function parcelTracking(parcel) {
  const fullTrackingUrl = parcelTrackingUrl(parcel);
  return {
    trackingNumber: parcel.tracking_number ? String(parcel.tracking_number) : undefined,
    trackingUrl: fullTrackingUrl?.length <= 255 ? fullTrackingUrl : undefined,
    carrier: parcel.carrier?.name || parcel.carrier?.code || parcel.shipment?.name || undefined,
  };
}

function parcelDetails(parcel) {
  const destination =
    parcel.to_city ||
    parcel.to?.city ||
    parcel.address?.city ||
    parcel.to_service_point?.city;
  const expected =
    parcel.expected_delivery_date ||
    parcel.to_service_point?.expected_delivery_date ||
    parcel.shipment?.expected_delivery_date;

  return {
    carrierStatus: parcel.status?.message || parcel.status?.code || undefined,
    shipmentName: parcel.shipment?.name || undefined,
    destinationCity: destination || undefined,
    expectedDeliveryDate: expected || undefined,
  };
}

async function processSendcloudWebhook(strapi, payload, rawBody) {
  if (payload?.action !== "parcel_status_changed") {
    return { ignored: true, action: payload?.action || "unknown" };
  }
  if (!payload.parcel || typeof payload.parcel !== "object") {
    throw new Error("Le webhook ne contient pas de colis.");
  }

  const eventHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const eventStore = storeFor(strapi, `event:${eventHash}`);
  if (await eventStore.get()) return { duplicate: true };
  if (eventsInFlight.has(eventHash)) return { duplicate: true };
  eventsInFlight.add(eventHash);

  try {

  const order = await findOrder(strapi, payload.parcel);
  if (!order) {
    strapi.log.warn(
      `Webhook Sendcloud ignoré : commande ${payload.parcel.order_number || payload.parcel.external_order_id || "inconnue"} absente de Strapi.`,
    );
    return { ignored: true, reason: "order_not_found" };
  }

  const receivedAt = eventDate(payload);
  if (order.lastCarrierEventAt && receivedAt < order.lastCarrierEventAt) {
    await eventStore.set({ value: { processedAt: new Date().toISOString(), order: order.reference } });
    return { ignored: true, reason: "stale_event" };
  }

  const status = classifyParcelStatus(payload.parcel.status);
  const tracking = parcelTracking(payload.parcel);
  const trackingJustAppeared =
    Boolean(tracking.trackingNumber) &&
    tracking.trackingNumber !== order.trackingNumber;
  if (trackingJustAppeared && !status.notificationType && !status.fulfillmentStatus) {
    status.fulfillmentStatus = "processing";
  }
  status.notificationType = resolveNotificationType(status, tracking, order);
  const nextFulfillmentStatus = forwardStatus(
    order.fulfillmentStatus,
    status.fulfillmentStatus,
  );
  const update = {
    ...tracking,
    lastCarrierEventAt: receivedAt,
    ...(nextFulfillmentStatus !== order.fulfillmentStatus
      ? { fulfillmentStatus: nextFulfillmentStatus }
      : {}),
  };
  if (status.fulfillmentStatus === "shipped" &&
      (!order.shippedAt || !order.trackingEmailSentAt)) {
    update.shippedAt = receivedAt;
  }
  Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);

  const updatedOrder = Object.keys(update).length
    ? await strapi.documents("api::order.order").update({
        documentId: order.documentId,
        data: update,
        fields: ORDER_FIELDS,
      })
    : order;

  const pickupAlreadySent =
    (status.notificationType === "shipped" || status.notificationType === "in_transit") &&
    (await storeFor(strapi, `notification:${order.documentId}:pickup`).get());
  const staleNotification =
    (order.fulfillmentStatus === "delivered" && status.notificationType !== "delivered") ||
    order.fulfillmentStatus === "canceled" ||
    pickupAlreadySent ||
    (status.notificationType === "shipped" && order.fulfillmentStatus === "shipped" && order.trackingEmailSentAt);
  let notificationSent = false;
  if (status.notificationType && !staleNotification) {
    const notificationKey = `notification:${order.documentId}:${status.notificationType}`;
    if (ordersNotifying.has(notificationKey)) {
      await eventStore.set({
        value: { processedAt: new Date().toISOString(), order: order.reference },
      });
      return { order: order.reference, fulfillmentStatus: nextFulfillmentStatus, notificationSent: false };
    }

    const notificationStore = storeFor(strapi, notificationKey);
    const alreadySent = await notificationStore.get();

    if (!alreadySent) {
      ordersNotifying.add(notificationKey);
      try {
        notificationSent = await sendOrderNotification(
          strapi,
          {
            ...order,
            ...updatedOrder,
            ...tracking,
            trackingUrl: parcelTrackingUrl(payload.parcel) || tracking.trackingUrl || order.trackingUrl,
            ...parcelDetails(payload.parcel),
          },
          status.notificationType,
        );
        if (!notificationSent) {
          throw new Error("La notification client n'a pas pu être envoyée.");
        }
        await notificationStore.set({
          value: { sentAt: new Date().toISOString() },
        });
        if (status.notificationType === "shipped" &&
            !order.trackingEmailSentAt) {
          await strapi.documents("api::order.order").update({
            documentId: order.documentId,
            data: { trackingEmailSentAt: new Date().toISOString() },
          });
        }
      } finally {
        ordersNotifying.delete(notificationKey);
      }
    }
  }

  await eventStore.set({
    value: {
      processedAt: new Date().toISOString(),
      order: order.reference,
    },
  });

  return {
    order: order.reference,
    fulfillmentStatus: nextFulfillmentStatus,
    notificationSent,
  };
  } finally {
    eventsInFlight.delete(eventHash);
  }
}

module.exports = {
  classifyParcelStatus,
  forwardStatus,
  parcelDetails,
  processSendcloudWebhook,
  resolveNotificationType,
  verifySendcloudSignature,
};
