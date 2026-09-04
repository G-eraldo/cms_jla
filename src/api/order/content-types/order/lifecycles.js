"use strict";

const { createInvoicePdf, invoiceNumber } = require("../../services/invoice");

const escapeHtml = (value) =>
  String(value || "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );
const formatAmount = (value) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    Number(value || 0),
  );
const emailSender = () => ({
  from: process.env.RESEND_FROM,
  replyTo: process.env.RESEND_REPLY_TO || process.env.RESEND_FROM,
});
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

async function getOrder(strapi, documentId) {
  return strapi.documents("api::order.order").findOne({
    documentId,
    fields: [
      "reference",
      "firstName",
      "lastName",
      "email",
      "addressLine1",
      "addressLine2",
      "postalCode",
      "city",
      "country",
      "shippingAmount",
      "totalAmount",
      "paidAt",
      "trackingNumber",
      "trackingUrl",
      "carrier",
      "stockDecrementedAt",
      "confirmationEmailSentAt",
    ],
    populate: {
      items: {
        fields: ["productDocumentId", "productName", "quantity", "unitPrice"],
      },
    },
  });
}

async function decrementStock(strapi, order) {
  const products = await Promise.all(
    order.items.map((item) =>
      strapi.documents("api::product.product").findOne({
        documentId: item.productDocumentId,
        fields: ["name", "stock"],
      }),
    ),
  );

  const unavailableItem = order.items.find(
    (item, index) =>
      !products[index] ||
      !Number.isInteger(products[index].stock) ||
      products[index].stock < item.quantity,
  );
  if (unavailableItem) {
    strapi.log.error(
      `Stock insuffisant après paiement pour la commande ${order.reference} : ${unavailableItem.productName}`,
    );
    return false;
  }

  await Promise.all(
    order.items.map((item, index) =>
    strapi.documents("api::product.product").update({
      documentId: products[index].documentId,
      data: { stock: products[index].stock - item.quantity },
      status: "published",
      }),
    ),
  );

  await strapi.documents("api::order.order").update({
    documentId: order.documentId,
    data: { stockDecrementedAt: new Date().toISOString() },
  });

  strapi.log.info(`Stock décrémenté pour la commande ${order.reference}`);
  return true;
}

function confirmationEmail(order) {
  const items = order.items
    .map(
      (item) =>
        `<li style="margin:0 0 8px">${escapeHtml(item.productName)} × ${item.quantity} — ${formatAmount(Number(item.unitPrice) * item.quantity)}</li>`,
    )
    .join("");

  return {
    subject: `Commande ${order.reference} confirmée — Maison JLA`,
    text: `Bonjour ${order.firstName}, votre commande ${order.reference} est confirmée. Montant total : ${formatAmount(order.totalAmount)}. Votre facture ${invoiceNumber(order)} est jointe à cet e-mail. Nous vous écrirons dès son expédition.`,
    html: `<div style="margin:0;padding:40px 20px;background:#f5eee6;font-family:Arial,sans-serif;color:#302722"><div style="max-width:600px;margin:0 auto;background:#ffffff"><div style="padding:32px;text-align:center;border-bottom:1px solid #e9ddd3"><div style="font-family:Georgia,serif;font-size:30px;color:#302722">Maison JLA</div></div><div style="padding:32px"><h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:26px;font-weight:normal">Votre commande est confirmée</h1><p>Bonjour ${escapeHtml(order.firstName)},</p><p>Merci infiniment pour votre confiance. Votre commande <strong>${escapeHtml(order.reference)}</strong> a bien été confirmée.</p><div style="margin:26px 0;padding:20px;background:#fdf7f2"><p style="margin:0 0 12px;font-weight:bold">Votre sélection</p><ul style="margin:0;padding-left:18px">${items}</ul><p style="margin:18px 0 0;font-weight:bold">Total réglé : ${formatAmount(order.totalAmount)}</p></div><p>Votre facture <strong>${escapeHtml(invoiceNumber(order))}</strong> est jointe à cet e-mail.</p><p>Nous vous écrirons dès que votre commande sera expédiée.</p><p>À très vite,<br>Maison JLA</p></div><div style="padding:18px 32px;border-top:1px solid #e9ddd3;text-align:center;font-size:12px;color:#776b64">Maison JLA<br>11 rue de la Gare — 80360 Guillemont</div></div></div>`,
  };
}

function trackingEmail(order) {
  const trackingUrl = safeUrl(order.trackingUrl);
  const trackingAction = trackingUrl
    ? `<p style="margin:26px 0 0"><a href="${escapeHtml(trackingUrl)}" style="display:inline-block;padding:14px 22px;background:#302722;color:#ffffff;text-decoration:none">Suivre mon colis</a></p>`
    : "";
  const carrier = order.carrier ? ` avec ${escapeHtml(order.carrier)}` : "";

  return {
    subject: `Votre commande ${order.reference} est expédiée — Maison JLA`,
    text: `Bonjour ${order.firstName}, votre commande ${order.reference} est expédiée${order.carrier ? ` avec ${order.carrier}` : ""}. Numéro de suivi : ${order.trackingNumber}.${trackingUrl ? ` Suivre le colis : ${trackingUrl}` : ""}`,
    html: `<div style="margin:0;padding:40px 20px;background:#f5eee6;font-family:Arial,sans-serif;color:#302722"><div style="max-width:600px;margin:0 auto;background:#ffffff"><div style="padding:32px;text-align:center;border-bottom:1px solid #e9ddd3"><div style="font-family:Georgia,serif;font-size:30px;color:#302722">Maison JLA</div></div><div style="padding:32px"><h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:26px;font-weight:normal">Votre commande est expédiée</h1><p>Bonjour ${escapeHtml(order.firstName)},</p><p>Votre commande <strong>${escapeHtml(order.reference)}</strong> a été confiée au transporteur${carrier}.</p><div style="margin:26px 0;padding:20px;background:#fdf7f2"><p style="margin:0 0 12px;font-weight:bold">Votre numéro de suivi</p><p style="margin:0;font-size:20px;font-weight:bold;letter-spacing:1px">${escapeHtml(order.trackingNumber)}</p>${order.carrier ? `<p style="margin:12px 0 0;color:#776b64">Transporteur : ${escapeHtml(order.carrier)}</p>` : ""}${trackingAction}</div><p>À très vite,<br>Maison JLA</p></div><div style="padding:18px 32px;border-top:1px solid #e9ddd3;text-align:center;font-size:12px;color:#776b64">Maison JLA<br>5 rue Joliot Curie — 80200 Flamicourt</div></div></div>`,
  };
}

module.exports = {
  async afterUpdate(event) {
    const { data, where } = event.params;
    const documentId = where?.documentId || event.result?.documentId;
    const paymentConfirmed = data.paymentStatus === "paid";
    const trackingAdded = Boolean(data.trackingNumber);
    if (!documentId || (!paymentConfirmed && !trackingAdded)) return;

    const order = await getOrder(strapi, documentId);
    if (!order) return;

    if (paymentConfirmed && !order.stockDecrementedAt)
      await decrementStock(strapi, order);

    if (paymentConfirmed && !trackingAdded && !order.confirmationEmailSentAt) {
      const email = confirmationEmail(order);
      const invoice = await createInvoicePdf(order);
      await strapi
        .plugin("email")
        .service("email")
        .send({
          ...emailSender(),
          to: order.email,
          ...email,
          attachments: [
            {
              filename: `facture-${invoiceNumber(order)}.pdf`,
              content: invoice,
            },
          ],
        });
      await strapi.documents("api::order.order").update({
        documentId,
        data: { confirmationEmailSentAt: new Date().toISOString() },
      });
      strapi.log.info(
        `E-mail de confirmation envoyé pour la commande ${order.reference}`,
      );
    }

    if (trackingAdded && !order.trackingEmailSentAt) {
      const email = trackingEmail(order);
      await strapi
        .plugin("email")
        .service("email")
        .send({
          ...emailSender(),
          to: order.email,
          ...email,
        });
      await strapi.documents("api::order.order").update({
        documentId,
        data: {
          fulfillmentStatus: "shipped",
          shippedAt: new Date().toISOString(),
          trackingEmailSentAt: new Date().toISOString(),
        },
      });
    }
  },
};
