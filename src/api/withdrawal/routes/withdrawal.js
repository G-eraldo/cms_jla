"use strict";

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/withdrawals/find-duplicate",
      handler: "withdrawal.findDuplicate",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "POST",
      path: "/withdrawals/submit",
      handler: "withdrawal.submit",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "POST",
      path: "/withdrawals/:documentId/record-email-status",
      handler: "withdrawal.recordEmailStatus",
      config: { policies: [], middlewares: [] },
    },
  ],
};
