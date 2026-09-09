"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { archiveInvoicePdf, invoiceArchiveKey, pdfHash, settings } = require("../src/api/order/services/invoice-archive");

const env = {
  NODE_ENV: "test",
  CLOUDFLARE_R2_ACCOUNT_ID: "account-id",
  CLOUDFLARE_R2_ACCESS_KEY_ID: "access-key",
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: "secret-key",
  CLOUDFLARE_R2_INVOICES_BUCKET: "maison-jla-invoices",
};

test("construit une clé d'archive de facture prédictible et non publique", () => {
  assert.equal(invoiceArchiveKey("FAC-2026-000001", "2026-09-09T12:00:00.000Z"), "invoices/2026/FAC-2026-000001.pdf");
  assert.equal(pdfHash(Buffer.from("invoice")), "52d6e3de4fa0dcc29946695f93940c3e7f26f30e1e39f4b1a49ad98839112786");
});

test("n'archive pas hors production tant que les clés R2 ne sont pas renseignées", async () => {
  assert.equal(settings({ NODE_ENV: "test" }).configured, false);
  assert.deepEqual(await archiveInvoicePdf({ invoiceNumber: "FAC-2026-000001", issuedAt: "2026-09-09T12:00:00.000Z", pdf: Buffer.from("invoice"), env: { NODE_ENV: "test" } }), { skipped: true });
});

test("réutilise une archive R2 identique sans l'écraser", async () => {
  const sent = [];
  const checksum = pdfHash(Buffer.from("invoice"));
  const result = await archiveInvoicePdf({
    invoiceNumber: "FAC-2026-000001",
    issuedAt: "2026-09-09T12:00:00.000Z",
    pdf: Buffer.from("invoice"),
    env,
    client: { async send(command) { sent.push(command.constructor.name); return { Metadata: { sha256: checksum } }; } },
  });
  assert.deepEqual(result, { key: "invoices/2026/FAC-2026-000001.pdf", checksum, archived: false });
  assert.deepEqual(sent, ["HeadObjectCommand"]);
});

test("dépose un PDF avec une précondition d'absence et son empreinte", async () => {
  const commands = [];
  const result = await archiveInvoicePdf({
    invoiceNumber: "FAC-2026-000002",
    issuedAt: "2026-09-09T12:00:00.000Z",
    pdf: Buffer.from("invoice"),
    env,
    client: {
      async send(command) {
        commands.push(command);
        if (command.constructor.name === "HeadObjectCommand") {
          const error = new Error("Object not found");
          error.name = "NotFound";
          throw error;
        }
        return {};
      },
    },
  });
  assert.equal(result.archived, true);
  assert.equal(commands[1].constructor.name, "PutObjectCommand");
  assert.ok(commands[1].middlewareStack.identify().some((entry) => entry.includes("invoiceArchiveIfNoneMatch")));
  assert.equal(commands[1].input.ContentType, "application/pdf");
  assert.equal(commands[1].input.Metadata.sha256, result.checksum);
});
