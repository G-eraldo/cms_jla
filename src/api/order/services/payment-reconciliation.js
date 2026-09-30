"use strict";

const {
  attachMolliePayment,
  claimRefund,
  confirmPaidReservation,
  recordPaymentOutcome,
  recordRefund,
  releaseReservation,
  recordExternalPaymentReversal,
  verifyMolliePayment,
} = require("./stock-reservation");

const API = "https://api.mollie.com/v2";
const TERMINAL = new Set(["failed", "canceled", "expired"]);
const ORDER_FIELDS = ["reference", "molliePaymentId", "paymentStatus", "refundStatus", "refundRequestedAt", "mollieRefundId", "totalAmount", "currency"];

function metadataOrderId(metadata) {
  if (typeof metadata === "string") {
    try { return metadataOrderId(JSON.parse(metadata)); } catch { return null; }
  }
  return metadata && typeof metadata === "object" ? metadata.orderDocumentId || null : null;
}

async function mollieRequest(apiKey, url, options = {}) {
  const target = new URL(url, API);
  if (target.origin !== "https://api.mollie.com") throw new Error("URL Mollie invalide.");
  const response = await fetch(target, {
    ...options,
    headers: { Authorization: `Bearer ${apiKey}`, ...options.headers },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Mollie HTTP ${response.status}`);
  return response.json();
}

async function findOrder(strapi, documentId) {
  return strapi.documents("api::order.order").findOne({ documentId, fields: ORDER_FIELDS });
}

async function existingRefund(apiKey, payment, documentId) {
  let next = `${API}/payments/${encodeURIComponent(payment.id)}/refunds?limit=100`;
  for (let page = 0; next && page < 5; page += 1) {
    const result = await mollieRequest(apiKey, next);
    const found = (result._embedded?.refunds || []).find((refund) =>
      metadataOrderId(refund.metadata) === documentId &&
      refund.amount?.currency === payment.amount?.currency &&
      refund.amount?.value === payment.amount?.value);
    if (found) return found;
    next = result._links?.next?.href || null;
  }
  if (next) throw new Error("Liste des remboursements incomplète.");
  return null;
}

async function reconcileRefund(strapi, order, payment, apiKey) {
  if (!["pending", "processing"].includes(order.refundStatus)) return;
  let refund = await existingRefund(apiKey, payment, order.documentId);
  if (refund) {
    if (order.refundStatus === "pending") await claimRefund(strapi, order.documentId);
    await recordRefund(strapi, order.documentId, refund);
    return;
  }
  const claimed = order.refundStatus === "pending" && await claimRefund(strapi, order.documentId);
  const age = Date.now() - new Date(order.refundRequestedAt || 0).getTime();
  if (!claimed && (order.refundStatus !== "processing" || age < 2 * 60 * 1000)) return;
  refund = await mollieRequest(apiKey, `${API}/payments/${encodeURIComponent(payment.id)}/refunds`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": `maison-jla-stock-${order.documentId}` },
    body: JSON.stringify({
      amount: { currency: payment.amount.currency, value: payment.amount.value },
      description: `Remboursement automatique — ${order.documentId}`,
      metadata: { orderDocumentId: order.documentId },
    }),
  });
  await recordRefund(strapi, order.documentId, refund);
}

async function reconcilePayment(strapi, payment, apiKey) {
  const documentId = metadataOrderId(payment.metadata);
  if (!documentId || !/^tr_[A-Za-z0-9]+$/.test(payment.id || "")) return;
  let order = await findOrder(strapi, documentId);
  if (!order) {
    strapi.log.error(`Paiement Mollie ${payment.id} sans commande locale.`);
    return;
  }
  if (!order.molliePaymentId) {
    await attachMolliePayment(strapi, documentId, payment.id);
    order = await findOrder(strapi, documentId);
  }
  if (order.molliePaymentId !== payment.id) {
    strapi.log.error(`Paiement Mollie ${payment.id} en conflit avec la commande ${order.reference}.`);
    return;
  }
  const verified = await verifyMolliePayment(order, payment.id);
  if (verified.status === "paid") {
    if (["paid", "refunded"].includes(order.paymentStatus)) {
      const reversal = await recordExternalPaymentReversal(strapi, order, verified);
      if (reversal) return;
    }
    await confirmPaidReservation(strapi, documentId);
    order = await findOrder(strapi, documentId);
    if (["pending", "processing"].includes(order.refundStatus)) {
      await reconcileRefund(strapi, order, verified, apiKey);
    }
  } else if (TERMINAL.has(verified.status)) {
    await recordPaymentOutcome(strapi, documentId, verified.status);
    await releaseReservation(strapi, documentId);
  }
}

async function reconcileKnownOrders(strapi, apiKey) {
  const orders = [];
  for (let start = 0; start < 10000; start += 100) {
    const page = await strapi.documents("api::order.order").findMany({
      filters: { molliePaymentId: { $notNull: true }, $or: [
        { paymentStatus: "pending" },
        { paymentStatus: "paid", refundStatus: { $in: ["pending", "processing"] } },
        { paymentStatus: "paid", refundStatus: "failed" },
        { paymentStatus: "paid", refundStatus: "refunded" },
        { paymentStatus: "refunded" },
      ] },
      fields: ORDER_FIELDS,
      sort: ["createdAt:asc"],
      start,
      limit: 100,
    });
    orders.push(...page);
    if (page.length < 100) break;
    if (start === 9900) throw new Error("Trop de commandes à réconcilier en un passage.");
  }
  for (const order of orders) {
    if (!order.molliePaymentId) continue;
    try {
      const payment = await mollieRequest(apiKey, `${API}/payments/${encodeURIComponent(order.molliePaymentId)}`);
      await reconcilePayment(strapi, payment, apiKey);
    } catch (error) {
      strapi.log.error(`Réconciliation ${order.reference} : ${error.message}`);
    }
  }
}

async function reconcileRecentPayments(strapi, apiKey, lookbackMs = 60 * 60 * 1000) {
  const cutoff = Date.now() - lookbackMs;
  let next = `${API}/payments?limit=250&sort=desc`;
  for (let page = 0; next && page < 40; page += 1) {
    const result = await mollieRequest(apiKey, next);
    for (const payment of result._embedded?.payments || []) {
      if (new Date(payment.createdAt).getTime() < cutoff) return;
      if (!metadataOrderId(payment.metadata)) continue;
      try { await reconcilePayment(strapi, payment, apiKey); }
      catch (error) { strapi.log.error(`Réconciliation ${payment.id} : ${error.message}`); }
    }
    next = result._links?.next?.href || null;
  }
  if (next) throw new Error("Liste des paiements incomplète : intervention nécessaire.");
}

async function reconcilePayments(strapi, { deep = false } = {}) {
  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) throw new Error("MOLLIE_API_KEY manque pour la réconciliation.");
  await reconcileKnownOrders(strapi, apiKey);
  await reconcileRecentPayments(strapi, apiKey, deep ? 35 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000);
}

module.exports = { metadataOrderId, reconcilePayments, reconcilePayment, reconcileRefund };
