"use strict";

function formatAmount(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));
}

function notificationForOrder(order) {
  const itemCount = (order.items || []).reduce(
    (total, item) => total + Number(item.quantity || 0),
    0,
  );
  const delivery = order.deliveryMethod === "pickup" ? "point relais" : "domicile";

  return {
    title: "Nouvelle commande Maison JLA",
    message: `${order.reference} — ${formatAmount(order.totalAmount)} · ${itemCount} article${itemCount > 1 ? "s" : ""} · ${delivery}`,
  };
}

function ntfyTopicUrl(value) {
  if (!value) throw new Error("NTFY_TOPIC_URL n'est pas configurée dans Strapi.");

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NTFY_TOPIC_URL doit être une URL HTTPS de topic ntfy valide.");
  }

  if (url.protocol !== "https:" || !url.pathname || url.username || url.password) {
    throw new Error("NTFY_TOPIC_URL doit être une URL HTTPS de topic ntfy valide.");
  }
  return url.toString();
}

async function notifyOrderPaid(order, options = {}) {
  if (!order?.reference) {
    throw new Error("La commande n'a pas de référence pour la notification ntfy.");
  }

  const notification = notificationForOrder(order);
  const fetchImpl = options.fetchImpl || fetch;
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    Title: notification.title,
    Priority: "default",
    Tags: "shopping_cart",
  };
  if (process.env.NTFY_TOKEN) {
    headers.Authorization = `Bearer ${process.env.NTFY_TOKEN}`;
  }
  const response = await fetchImpl(ntfyTopicUrl(options.topicUrl || process.env.NTFY_TOPIC_URL), {
    method: "POST",
    headers,
    body: notification.message,
    signal: options.signal || AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`ntfy a refusé la notification (${response.status}).`);
  }
}

module.exports = { notificationForOrder, notifyOrderPaid, ntfyTopicUrl };
