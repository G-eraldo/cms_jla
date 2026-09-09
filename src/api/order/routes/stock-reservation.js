"use strict";

module.exports = {
  routes: [
    { method: "POST", path: "/orders/reserve", handler: "order.reserve", config: { policies: [], middlewares: [] } },
    { method: "POST", path: "/orders/:documentId/attach-payment", handler: "order.attachPayment", config: { policies: [], middlewares: [] } },
    { method: "POST", path: "/orders/:documentId/release-reservation", handler: "order.releaseReservation", config: { policies: [], middlewares: [] } },
    { method: "POST", path: "/orders/:documentId/confirm-paid-reservation", handler: "order.confirmPaidReservation", config: { policies: [], middlewares: [] } },
    { method: "POST", path: "/orders/:documentId/record-refund", handler: "order.recordRefund", config: { policies: [], middlewares: [] } },
    { method: "POST", path: "/orders/:documentId/record-refund-failure", handler: "order.recordRefundFailure", config: { policies: [], middlewares: [] } }
  ]
};
