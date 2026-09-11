"use strict";

const SENDCLOUD_ORDERS_URL = "https://panel.sendcloud.sc/api/v3/orders";

function splitAddress(address) {
  const normalized = String(address || "").trim();
  const match = normalized.match(/^(\d+[a-z]?(?:\s+(?:bis|ter|quater))?)\s+(.+)$/i);

  if (!match) return { address_line_1: normalized };

  return {
    address_line_1: match[2],
    house_number: match[1],
  };
}

function price(value, currency) {
  return {
    value: Number(Number(value || 0).toFixed(2)),
    currency,
  };
}

function buildSendcloudOrder(order, integrationId) {
  if (!order?.documentId || !order?.reference) {
    throw new Error("La commande Strapi n'a pas d'identifiant exploitable.");
  }

  const numericIntegrationId = Number(integrationId);
  if (!Number.isInteger(numericIntegrationId) || numericIntegrationId < 1) {
    throw new Error("SENDCLOUD_INTEGRATION_ID est invalide.");
  }

  const currency = order.currency || "EUR";
  const shippingAddress = {
    name: `${order.firstName || ""} ${order.lastName || ""}`.trim(),
    ...splitAddress(order.addressLine1),
    address_line_2: order.addressLine2 || undefined,
    postal_code: order.postalCode,
    city: order.city,
    country_code: "FR",
    phone_number: order.phone,
    email: order.email,
  };

  const payload = {
    order_id: order.documentId,
    order_number: order.reference,
    order_details: {
      integration: { id: numericIntegrationId },
      status: { code: "paid", message: "Payée" },
      order_created_at: order.createdAt || order.paidAt,
      order_items: order.items.map((item) => ({
        name: item.productName,
        quantity: item.quantity,
        unit_price: price(item.unitPrice, currency),
        total_price: price(Number(item.unitPrice) * item.quantity, currency),
      })),
    },
    payment_details: {
      is_cash_on_delivery: false,
      total_price: price(order.totalAmount, currency),
      status: { code: "paid", message: "Payée" },
      freight_costs: price(order.shippingAmount, currency),
    },
    shipping_address: shippingAddress,
    shipping_details: {
      is_local_pickup: false,
      delivery_indicator:
        order.deliveryMethod === "pickup"
          ? `Mondial Relay - ${order.pickupPoint || "point relais"}`.slice(0, 250)
          : "Livraison à domicile",
    },
  };

  if (order.deliveryMethod === "pickup") {
    if (!/^\d+$/.test(String(order.pickupPointId || ""))) {
      throw new Error("La commande ne contient pas de point relais Sendcloud valide.");
    }
    payload.service_point_details = { id: String(order.pickupPointId) };
  }

  return payload;
}

async function syncOrderToSendcloud(order, options = {}) {
  const publicKey = options.publicKey || process.env.SENDCLOUD_PUBLIC_KEY;
  const secretKey = options.secretKey || process.env.SENDCLOUD_SECRET_KEY;
  const integrationId =
    options.integrationId || process.env.SENDCLOUD_INTEGRATION_ID;
  const fetchImpl = options.fetchImpl || fetch;

  if (!publicKey || !secretKey) {
    throw new Error("Les clés API Sendcloud ne sont pas configurées dans Strapi.");
  }

  const request = {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([buildSendcloudOrder(order, integrationId)]),
  };
  const maxAttempts = options.maxAttempts || 2;
  const retryDelay = options.retryDelay ?? 250;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(SENDCLOUD_ORDERS_URL, {
        ...request,
        signal: options.signal || AbortSignal.timeout(5000),
      });
    } catch (error) {
      lastError = new Error(`Sendcloud est injoignable : ${error.message}`);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
        continue;
      }
      throw lastError;
    }

    const body = await response.json().catch(() => null);
    if (response.ok) {
      const importedOrder = body?.data?.[0];
      if (!importedOrder?.id) {
        throw new Error("Sendcloud n'a pas confirmé l'import de la commande.");
      }
      return importedOrder;
    }

    lastError = new Error(
      `Sendcloud a refusé la commande (${response.status}).`,
    );
    const transientFailure = response.status === 429 || response.status >= 500;
    if (!transientFailure || attempt === maxAttempts) throw lastError;
    await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
  }

  throw lastError;
}

module.exports = {
  SENDCLOUD_ORDERS_URL,
  buildSendcloudOrder,
  splitAddress,
  syncOrderToSendcloud,
};
