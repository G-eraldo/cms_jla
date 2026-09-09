"use strict";

const { createInvoicePdf, invoiceNumber } = require("../../services/invoice");
const { syncOrderToSendcloud } = require("../../services/sendcloud");
const { createTermsPdf, TERMS_VERSION } = require("../../services/terms");
const { notifyOrderPaid } = require("../../services/ntfy");

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
  from: process.env.RESEND_FROM || process.env.RESEND_REPLY_TO,
  replyTo: process.env.RESEND_REPLY_TO || process.env.RESEND_FROM,
});
async function getOrder(strapi, documentId) {
  return strapi.documents("api::order.order").findOne({
    documentId,
    fields: [
      "reference",
      "firstName",
      "lastName",
      "email",
      "phone",
      "addressLine1",
      "addressLine2",
      "postalCode",
      "city",
      "country",
      "deliveryMethod",
      "pickupPoint",
      "pickupPointId",
      "shippingAmount",
      "totalAmount",
      "currency",
      "createdAt",
      "paidAt",
      "stockDecrementedAt",
      "confirmationEmailSentAt",
      "ntfyNotificationSentAt",
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
    text: `Bonjour ${order.lastName}, votre commande ${order.reference} est confirmée. Montant total : ${formatAmount(order.totalAmount)}. Livraison : ${order.deliveryMethod === "pickup" ? `point relais ${order.pickupPoint || "sélectionné"}` : `${order.addressLine1}, ${order.postalCode} ${order.city}`}. Votre facture ${invoiceNumber(order)} et les CGV du ${TERMS_VERSION} sont jointes à cet e-mail. Nous vous écrirons dès son expédition.`,
    html: `<div style="margin:0;padding:40px 20px;background:#f5eee6;font-family:Arial,sans-serif;color:#302722"><div style="max-width:600px;margin:0 auto;background:#ffffff"><div style="padding:32px;text-align:center;border-bottom:1px solid #e9ddd3"><div style="font-family:Georgia,serif;font-size:30px;color:#302722">Maison JLA</div></div><div style="padding:32px"><h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:26px;font-weight:normal">Votre commande est confirmée</h1><p>Bonjour ${escapeHtml(order.lastName)},</p><p>Merci infiniment pour votre confiance. Votre commande <strong>${escapeHtml(order.reference)}</strong> a bien été confirmée.</p><div style="margin:26px 0;padding:20px;background:#fdf7f2"><p style="margin:0 0 12px;font-weight:bold">Votre sélection</p><ul style="margin:0;padding-left:18px">${items}</ul><p style="margin:18px 0 0;font-weight:bold">Livraison : ${order.deliveryMethod === "pickup" ? `point relais ${escapeHtml(order.pickupPoint || "sélectionné")}` : `${escapeHtml(order.addressLine1)}, ${escapeHtml(order.postalCode)} ${escapeHtml(order.city)}`}</p><p style="margin:8px 0 0;font-weight:bold">Total réglé : ${formatAmount(order.totalAmount)}</p></div><p>Votre facture <strong>${escapeHtml(invoiceNumber(order))}</strong> et les conditions générales de vente applicables au ${TERMS_VERSION} sont jointes à cet e-mail pour que vous puissiez les conserver.</p><p>Nous vous écrirons dès que votre commande sera expédiée.</p><p>À très vite,<br>Maison JLA</p></div><div style="padding:18px 32px;border-top:1px solid #e9ddd3;text-align:center;font-size:12px;color:#776b64">Maison JLA — Julia Touret EI<br>5 rue Joliot Curie — 80200 Flamicourt<br>maisonjla@outlook.com — 06 77 88 69 09</div></div></div>`,
  };
}

module.exports = {
  async afterUpdate(event) {
    const { data, where } = event.params;
    const documentId = where?.documentId || event.result?.documentId;
    const paymentConfirmed = data.paymentStatus === "paid";
    if (!documentId || !paymentConfirmed) return;

    const order = await getOrder(strapi, documentId);
    if (!order) return;

    if (paymentConfirmed && !order.stockDecrementedAt) {
      try {
        await decrementStock(strapi, order);
      } catch (error) {
        strapi.log.error(
          `Échec du décrément de stock pour la commande ${order.reference} : ${error.message}`,
        );
      }
    }

    if (paymentConfirmed && !order.confirmationEmailSentAt) {
      try {
        const email = confirmationEmail(order);
        const invoice = await createInvoicePdf(order);
        const terms = await createTermsPdf();
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
              {
                filename: "conditions-generales-de-vente-maison-jla.pdf",
                content: terms,
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
      } catch (error) {
        strapi.log.error(
          `Échec de l'e-mail de confirmation pour la commande ${order.reference} : ${error.message}`,
        );
      }
    }

    if (paymentConfirmed && !order.ntfyNotificationSentAt) {
      try {
        await notifyOrderPaid(order);
        await strapi.documents("api::order.order").update({
          documentId,
          data: { ntfyNotificationSentAt: new Date().toISOString() },
        });
        strapi.log.info(`Notification ntfy envoyée pour la commande ${order.reference}`);
      } catch (error) {
        strapi.log.error(
          `Échec de la notification ntfy pour la commande ${order.reference} : ${error.message}`,
        );
      }
    }

    if (paymentConfirmed) {
      try {
        const importedOrder = await syncOrderToSendcloud(order);
        strapi.log.info(
          `Commande ${order.reference} importée dans Sendcloud (${importedOrder.id})`,
        );
      } catch (error) {
        strapi.log.error(
          `Échec de l'import Sendcloud pour la commande ${order.reference} : ${error.message}`,
        );
      }
    }
  },
};
