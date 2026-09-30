"use strict";

const inFlight = new Set();
const ORDER_UID = "api::order.order";

const escapeHtml = (value) =>
  String(value || "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

function formatAmount(cents) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function refundEmail(order, refundedCents) {
  const amount = formatAmount(refundedCents);
  const reference = escapeHtml(order.reference);
  const name = escapeHtml(order.firstName);
  return {
    subject: `Remboursement de votre commande ${order.reference} — Maison JLA`,
    text: `Bonjour ${order.firstName}, le remboursement de votre commande ${order.reference} a été confirmé. Le montant remboursé à ce jour est de ${amount}. Il sera reversé sur le moyen de paiement utilisé lors de la commande. Le délai d'apparition sur votre compte dépend de votre établissement bancaire. Pour toute question, répondez à cet e-mail ou écrivez à contact@maisonjla.fr. Maison JLA`,
    html: `<div style="margin:0;padding:40px 20px;background:#f5eee6;font-family:Arial,sans-serif;color:#302722"><div style="max-width:600px;margin:0 auto;background:#ffffff"><div style="padding:32px;text-align:center;border-bottom:1px solid #e9ddd3"><div style="font-family:Georgia,serif;font-size:30px;color:#302722">Maison JLA</div></div><div style="padding:32px"><h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:26px;font-weight:normal">Votre remboursement est confirmé</h1><p>Bonjour ${name},</p><p>Le remboursement de votre commande <strong>${reference}</strong> a été confirmé.</p><div style="margin:26px 0;padding:20px;background:#fdf7f2"><p style="margin:0 0 8px">Montant remboursé à ce jour</p><p style="margin:0;font-size:24px;font-weight:bold">${amount}</p></div><p>Le remboursement sera reversé sur le moyen de paiement utilisé lors de la commande. Le délai d’apparition sur votre compte dépend de votre établissement bancaire.</p><p>Pour toute question, répondez à cet e-mail ou écrivez à contact@maisonjla.fr.</p><p style="margin-top:28px">À très vite,<br>Maison JLA</p></div><div style="padding:18px 32px;border-top:1px solid #e9ddd3;text-align:center;font-size:12px;color:#776b64">Maison JLA — Julia Touret EI<br>5 Rue Joliot-Curie — 80200 Doingt<br>contact@maisonjla.fr — 06 77 88 69 09</div></div></div>`,
  };
}

async function notifyRefundCustomer(
  strapi,
  documentId,
  refundedCents,
  currency,
) {
  if (
    !Number.isSafeInteger(refundedCents) ||
    refundedCents <= 0 ||
    currency !== "EUR"
  ) {
    return false;
  }
  const key = `customer-refund:${documentId}:${refundedCents}`;
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  try {
    const store = strapi.store({
      type: "plugin",
      name: "maison-jla-refunds",
      key,
    });
    if (await store.get()) return false;
    const order = await strapi.documents(ORDER_UID).findOne({
      documentId,
      fields: ["reference", "firstName", "email", "totalAmount", "currency"],
    });
    if (
      !order ||
      order.currency !== currency ||
      !order.email ||
      !order.reference
    ) {
      throw new Error("Commande ou destinataire du remboursement introuvable.");
    }
    const totalCents = Math.round(Number(order.totalAmount) * 100);
    if (!Number.isSafeInteger(totalCents) || refundedCents > totalCents) {
      throw new Error("Montant remboursé incohérent avec la commande.");
    }
    await strapi
      .plugin("email")
      .service("email")
      .send({
        from: process.env.RESEND_FROM || process.env.RESEND_REPLY_TO,
        replyTo: process.env.RESEND_REPLY_TO || process.env.RESEND_FROM,
        to: order.email,
        idempotencyKey: `customer-refund/${documentId}/${refundedCents}`,
        ...refundEmail(order, refundedCents),
      });
    await store.set({ value: { sentAt: new Date().toISOString() } });
    return true;
  } finally {
    inFlight.delete(key);
  }
}

module.exports = { notifyRefundCustomer, refundEmail };
