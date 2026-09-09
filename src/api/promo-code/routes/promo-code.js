module.exports = {
  routes: [
    {
      method: "POST",
      path: "/promo-codes/validate",
      handler: "promo-code.validate",
      config: { auth: true, policies: [], middlewares: [] },
    },
  ],
};
