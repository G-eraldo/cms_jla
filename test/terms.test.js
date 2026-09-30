"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { TERMS_SECTIONS, TERMS_VERSION, createTermsPdf, termsHash, termsSnapshot } = require("../src/api/order/services/terms");

test("l'encadré de garantie reprend le modèle D. 211-2", () => {
  const boxed = TERMS_SECTIONS.find((section) => section.boxed);
  const text = boxed.paragraphs.join(" ");
  assert.match(TERMS_VERSION, /11 septembre 2026/);
  assert.match(text, /L\. 217-1 à L\. 217-32/);
  assert.match(text, /L\. 241-5/);
  assert.match(text, /1641 à 1649/);
  assert.equal(termsHash(), termsHash());
  assert.equal(termsSnapshot().sections[0].paragraphs[0].includes("RCS Amiens"), true);
});

test("les CGV jointes restent identiques lors d'une relance d'e-mail", async () => {
  const snapshot = termsSnapshot();
  const first = await createTermsPdf(snapshot);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const retry = await createTermsPdf(snapshot);
  assert.ok(first.equals(retry));
});
