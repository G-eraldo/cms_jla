module.exports = {
  routes: [
    {
      method: "POST",
      path: "/promo-codes/validate",
      handler: "promo-code.validate",
      config: { policies: [], middlewares: [] },
    },
  ],
};
