"use strict";

const { createHash } = require("node:crypto");
const PDFDocument = require("pdfkit");

const SELLER = {
  name: "Julia Touret",
  brand: "Maison JLA",
  status: "Entrepreneur individuel",
  address: "5 Rue Joliot-Curie 80200 Doingt",
  siren: "109 541 771",
  siret: "109 541 771 00019",
  email: "maisonjla@outlook.com",
  phone: "06 77 88 69 09",
  tva: "TVA non applicable, art. 293 B du CGI",
};

const formatAmount = (value) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));

const formatDate = (value) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
    value ? new Date(value) : new Date(),
  );

const invoiceNumber = (order) => order.invoiceNumber || `PROV-${order.reference}`;

const invoiceSnapshot = (order) => ({
  number: invoiceNumber(order),
  issuedAt: order.invoiceIssuedAt || order.paidAt,
  saleDate: order.paidAt,
  seller: SELLER,
  customer: {
    firstName: order.firstName,
    lastName: order.lastName,
    addressLine1: order.addressLine1,
    addressLine2: order.addressLine2 || null,
    postalCode: order.postalCode,
    city: order.city,
    country: order.country,
  },
  items: order.items.map((item) => ({
    productName: item.productName,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
  })),
  subtotalAmount: Number(order.subtotalAmount || 0),
  promoCode: order.promoCode || null,
  discountAmount: Number(order.discountAmount || 0),
  shippingAmount: Number(order.shippingAmount || 0),
  totalAmount: Number(order.totalAmount || 0),
  currency: order.currency || "EUR",
  vat: "exonération — article 293 B du CGI",
});

const invoiceHash = (snapshot) =>
  createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

async function ensureInvoice(strapi, documentId) {
  // The unique invoice number is the concurrency guard. A conflicting insert is
  // retried, so two paid orders cannot retain the same number.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const order = await strapi.documents("api::order.order").findOne({
      documentId,
      fields: ["invoiceNumber", "paidAt"],
    });
    if (!order) throw new Error("Commande introuvable pour la facture.");
    if (order.invoiceNumber) return order.invoiceNumber;

    const issuedAt = new Date().toISOString();
    const year = issuedAt.slice(0, 4);
    const latest = await strapi.db
      .getConnection("orders")
      .whereNotNull("invoice_number")
      .andWhere("invoice_number", "like", `FAC-${year}-%`)
      .orderBy("invoice_number", "desc")
      .first("invoice_number");
    const previous = Number(String(latest?.invoice_number || "").split("-").at(-1)) || 0;
    const number = `FAC-${year}-${String(previous + 1).padStart(6, "0")}`;

    try {
      const updated = await strapi.db.transaction(async ({ trx }) =>
        strapi.db
          .getConnection("orders")
          .transacting(trx)
          .where({ document_id: documentId })
          .whereNull("invoice_number")
          .update({ invoice_number: number, invoice_issued_at: issuedAt }),
      );
      if (updated === 1) return number;
    } catch (error) {
      if (!/unique|duplicate/i.test(String(error.message))) throw error;
    }
  }
  throw new Error("Impossible d'attribuer un numéro de facture unique.");
}

const writeLine = (document, label, value, y) => {
  document.font("Helvetica-Bold").text(label, 50, y);
  document.font("Helvetica").text(value, 180, y, { width: 365 });
};

function createInvoicePdf(order) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `Facture ${invoiceNumber(order)}`,
        Author: SELLER.brand,
      },
    });
    const chunks = [];

    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    document
      .fillColor("#302722")
      .font("Helvetica-Bold")
      .fontSize(24)
      .text("FACTURE");
    document
      .fontSize(11)
      .font("Helvetica")
      .text(`N° ${invoiceNumber(order)}`, { align: "right" });
    document.text(`Émise le ${formatDate(order.invoiceIssuedAt || order.paidAt)}`, { align: "right" });
    document.text(`Vente réglée le ${formatDate(order.paidAt)}`, { align: "right" });
    document.moveDown(2);

    document.font("Helvetica-Bold").fontSize(11).text("Vendeur");
    document
      .font("Helvetica")
      .fontSize(10)
      .text(
        `${SELLER.brand}\n${SELLER.name} — ${SELLER.status}\n${SELLER.address}\nSIREN : ${SELLER.siren}\nSIRET : ${SELLER.siret}\n${SELLER.email} — ${SELLER.phone}\nTVA non applicable, art. 293 B du CGI`,
        { width: 245 },
      );
    const sellerBottom = document.y;

    document.font("Helvetica-Bold").fontSize(11).text("Client", 330, 130);
    document
      .font("Helvetica")
      .fontSize(10)
      .text(
        `${order.firstName} ${order.lastName}\n${order.addressLine1}${order.addressLine2 ? `\n${order.addressLine2}` : ""}\n${order.postalCode} ${order.city}\n${order.country}`,
        330,
        148,
        { width: 210 },
      );
    document.y = Math.max(sellerBottom, document.y) + 32;

    const tableTop = document.y;
    document.rect(50, tableTop, 495, 24).fill("#f5eee6");
    document.fillColor("#302722").font("Helvetica-Bold").fontSize(9);
    document.text("DÉSIGNATION", 60, tableTop + 8, { width: 250 });
    document.text("QTÉ", 325, tableTop + 8, { width: 45, align: "right" });
    document.text("P.U. HT", 385, tableTop + 8, { width: 70, align: "right" });
    document.text("TOTAL HT / TTC", 465, tableTop + 8, {
      width: 70,
      align: "right",
    });

    let y = tableTop + 38;
    document.font("Helvetica").fontSize(10);
    for (const item of order.items) {
      const lineTotal = Number(item.unitPrice) * Number(item.quantity);
      document.text(item.productName, 60, y, { width: 250 });
      document.text(String(item.quantity), 325, y, {
        width: 45,
        align: "right",
      });
      document.text(formatAmount(item.unitPrice), 385, y, {
        width: 70,
        align: "right",
      });
      document.text(formatAmount(lineTotal), 465, y, {
        width: 70,
        align: "right",
      });
      y += 24;
    }

    if (Number(order.discountAmount) > 0) {
      document.text(`Remise — code ${order.promoCode}`, 60, y, { width: 250 });
      document.text(`− ${formatAmount(order.discountAmount)}`, 465, y, {
        width: 70,
        align: "right",
      });
      y += 24;
    }

    document.text("Livraison (HT = TTC)", 60, y, { width: 250 });
    document.text(formatAmount(order.shippingAmount), 465, y, {
      width: 70,
      align: "right",
    });
    y += 32;
    document.moveTo(330, y).lineTo(545, y).strokeColor("#d9cfc6").stroke();
    y += 12;
    document.font("Helvetica-Bold").fontSize(12);
    document.text("Total HT = TTC", 330, y, { width: 125 });
    document.text(formatAmount(order.totalAmount), 465, y, {
      width: 70,
      align: "right",
    });
    y += 36;

    document.font("Helvetica").fontSize(9).fillColor("#776b64");
    document.text(
      `Commande ${order.reference} réglée le ${formatDate(order.paidAt)}. TVA non applicable, art. 293 B du CGI.`,
      50,
      y,
      { width: 495 },
    );
    document.end();
  });
}

module.exports = { createInvoicePdf, ensureInvoice, invoiceHash, invoiceNumber, invoiceSnapshot };
