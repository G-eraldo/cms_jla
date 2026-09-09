"use strict";

const { createHash } = require("node:crypto");
const { HeadObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const requiredSettings = [
  "CLOUDFLARE_R2_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_INVOICES_BUCKET",
];

const pdfHash = (pdf) => createHash("sha256").update(pdf).digest("hex");

const invoiceArchiveKey = (invoiceNumber, issuedAt) => {
  const year = String(issuedAt || new Date().toISOString()).slice(0, 4);
  const safeNumber = String(invoiceNumber).replace(/[^A-Z0-9-]/gi, "_");
  return `invoices/${year}/${safeNumber}.pdf`;
};

function settings(env = process.env) {
  const missing = requiredSettings.filter((setting) => !env[setting]);
  return {
    configured: missing.length === 0,
    missing,
    bucket: env.CLOUDFLARE_R2_INVOICES_BUCKET,
    endpoint: env.CLOUDFLARE_R2_ACCOUNT_ID
      ? `https://${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : null,
  };
}

function createR2Client(env = process.env) {
  const config = settings(env);
  if (!config.configured) {
    throw new Error(`Configuration Cloudflare R2 incomplète : ${config.missing.join(", ")}`);
  }

  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    },
  });
}

function createConditionalPutCommand(input) {
  const command = new PutObjectCommand(input);
  // R2 supports If-None-Match on PutObject. The AWS JavaScript SDK does not
  // expose this R2-compatible header as a command input, so add it before the
  // request is signed and sent.
  command.middlewareStack.add(
    (next) => async (args) => {
      args.request.headers["if-none-match"] = "*";
      return next(args);
    },
    { step: "build", name: "invoiceArchiveIfNoneMatch" },
  );
  return command;
}

async function archiveInvoicePdf({ invoiceNumber, issuedAt, pdf, env = process.env, client }) {
  const config = settings(env);
  if (!config.configured) {
    if (env.NODE_ENV !== "production") return { skipped: true };
    throw new Error(`Archive de facture indisponible : ${config.missing.join(", ")}`);
  }

  const key = invoiceArchiveKey(invoiceNumber, issuedAt);
  const checksum = pdfHash(pdf);
  const r2 = client || createR2Client(env);

  try {
    const existing = await r2.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    if (existing.Metadata?.sha256 !== checksum) {
      throw new Error(`Une archive différente existe déjà pour ${invoiceNumber}.`);
    }
    return { key, checksum, archived: false };
  } catch (error) {
    if (!/NotFound|Not.?Found|404/i.test(String(error.name || error.Code || error.message))) {
      throw error;
    }
  }

  try {
    await r2.send(
      createConditionalPutCommand({
        Bucket: config.bucket,
        Key: key,
        Body: pdf,
        ContentType: "application/pdf",
        ContentDisposition: `attachment; filename=\"facture-${invoiceNumber}.pdf\"`,
        Metadata: { sha256: checksum, invoice: String(invoiceNumber) },
      }),
    );
    return { key, checksum, archived: true };
  } catch (error) {
    if (!/PreconditionFailed|412/i.test(String(error.name || error.Code || error.message))) {
      throw error;
    }

    const existing = await r2.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    if (existing.Metadata?.sha256 !== checksum) {
      throw new Error(`Une archive différente existe déjà pour ${invoiceNumber}.`);
    }
    return { key, checksum, archived: false };
  }
}

module.exports = {
  archiveInvoicePdf,
  createConditionalPutCommand,
  createR2Client,
  invoiceArchiveKey,
  pdfHash,
  settings,
};
