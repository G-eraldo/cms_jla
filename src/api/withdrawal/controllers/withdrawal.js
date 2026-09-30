"use strict";

const { createHash, randomUUID } = require("node:crypto");
const { createCoreController } = require("@strapi/strapi").factories;

const UID = "api::withdrawal.withdrawal";
const fields = ["reference"];
const declarationFields = [
  "firstName",
  "lastName",
  "email",
  "orderReference",
  "products",
  "orderedAt",
  "receivedAt",
];
const clean = (value, maxLength) =>
  String(value || "").trim().slice(0, maxLength);

function normalizedDeclaration(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (Object.keys(input).some((key) => !declarationFields.includes(key))) return null;
  const declaration = {
    firstName: clean(input.firstName, 100),
    lastName: clean(input.lastName, 100),
    email: clean(input.email, 254).toLowerCase(),
    orderReference: clean(input.orderReference, 100),
    products: clean(input.products, 2000),
    orderedAt: clean(input.orderedAt, 10),
    receivedAt: clean(input.receivedAt, 10),
  };
  if (
    Object.values(declaration).some((value) => /[\r\n]/.test(value)) ||
    !declaration.firstName ||
    !declaration.lastName ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(declaration.email) ||
    !declaration.orderReference ||
    !declaration.products ||
    !/^\d{4}-\d{2}-\d{2}$/.test(declaration.orderedAt) ||
    (declaration.receivedAt && !/^\d{4}-\d{2}-\d{2}$/.test(declaration.receivedAt))
  ) return null;
  if (!declaration.receivedAt) declaration.receivedAt = null;
  return declaration;
}

function fingerprint(declaration) {
  return createHash("sha256").update(JSON.stringify({
    firstName: declaration.firstName.toLowerCase(),
    lastName: declaration.lastName.toLowerCase(),
    email: declaration.email.toLowerCase(),
    orderReference: declaration.orderReference.toUpperCase(),
    products: declaration.products,
    orderedAt: declaration.orderedAt,
    receivedAt: declaration.receivedAt || null,
  })).digest("hex");
}

async function findByFingerprint(strapi, value) {
  const [record] = await strapi.documents(UID).findMany({
    filters: { fingerprint: { $eq: value } },
    fields,
    limit: 1,
  });
  return record || null;
}

function publicReceipt(record, duplicate) {
  return {
    data: {
      documentId: record.documentId,
      reference: record.reference,
      ...(duplicate ? { duplicate: true } : {}),
    },
  };
}

module.exports = createCoreController(UID, ({ strapi }) => ({
  async submit(ctx) {
    const declaration = normalizedDeclaration(ctx.request.body?.data);
    if (!declaration) return ctx.badRequest("Déclaration invalide.");
    const value = fingerprint(declaration);
    const existing = await findByFingerprint(strapi, value);
    if (existing) {
      ctx.body = publicReceipt(existing, true);
      return;
    }

    const now = new Date();
    const reference = `RET-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
    try {
      const record = await strapi.documents(UID).create({
        data: {
          ...declaration,
          reference,
          fingerprint: value,
          declaredAt: now.toISOString(),
          emailStatus: "pending",
        },
      });
      ctx.status = 201;
      ctx.body = publicReceipt(record, false);
    } catch (error) {
      // L'index unique sur fingerprint arbitre les soumissions simultanées.
      const raced = await findByFingerprint(strapi, value);
      if (!raced) throw error;
      ctx.body = publicReceipt(raced, true);
    }
  },

  async recordEmailStatus(ctx) {
    const data = ctx.request.body?.data;
    if (
      !data || typeof data !== "object" || Array.isArray(data) ||
      Object.keys(data).some((key) => !["sellerSent", "customerSent"].includes(key)) ||
      typeof data.sellerSent !== "boolean" || typeof data.customerSent !== "boolean"
    ) return ctx.badRequest("État d’envoi invalide.");

    const emailStatus = data.sellerSent && data.customerSent
      ? "sent"
      : data.sellerSent || data.customerSent
        ? "partially_sent"
        : "failed";
    const timestamp = new Date().toISOString();
    const record = await strapi.documents(UID).update({
      documentId: ctx.params.documentId,
      data: {
        emailStatus,
        ...(data.sellerSent ? { sellerEmailSentAt: timestamp } : {}),
        ...(data.customerSent ? { customerReceiptSentAt: timestamp } : {}),
      },
    });
    if (!record) return ctx.notFound();
    ctx.status = 204;
  },
}));
