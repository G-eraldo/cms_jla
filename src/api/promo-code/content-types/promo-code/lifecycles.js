"use strict";

const { normalizeCode } = require("../../services/promo-code");

function normalizePromotion(event) {
  const data = event.params.data || {};
  if (Object.hasOwn(data, "code")) data.code = normalizeCode(data.code);

  const value = Number(data.value);
  if (data.kind === "percentage" && (!Number.isFinite(value) || value > 100)) {
    throw new Error("Une remise en pourcentage doit être comprise entre 0,01 et 100.");
  }
}

module.exports = {
  beforeCreate: normalizePromotion,
  beforeUpdate: normalizePromotion,
};
