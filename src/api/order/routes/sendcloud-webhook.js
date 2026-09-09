"use strict";

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/sendcloud/webhook",
      handler: "order.sendcloudWebhook",
      config: {
        auth: false,
      },
    },
  ],
};
