"use strict";

const { createCoreRouter } = require("@strapi/strapi").factories;

module.exports = createCoreRouter("api::order.order", {
  except: ["find", "findOne", "create", "update", "delete"],
});
