"use strict";

const { createCoreRouter } = require("@strapi/strapi").factories;

// Les routes CRUD génériques exposeraient des données personnelles au jeton.
module.exports = createCoreRouter("api::withdrawal.withdrawal", {
  except: ["find", "findOne", "create", "update", "delete"],
});
