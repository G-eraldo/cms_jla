"use strict";

module.exports = {
  routes: [
    { method: "POST", path: "/orders/reserve", handler: "order.reserve", config: { auth: true, policies: [], middlewares: [] } },
    { method: "POST", path: "/orders/:documentId/attach-payment", handler: "order.attachPayment", config: { auth: true, policies: [], middlewares: [] } },
    { method: "POST", path: "/orders/:documentId/release-reservation", handler: "order.releaseReservation", config: { auth: true, policies: [], middlewares: [] } },
    { method: "POST", path: "/orders/:documentId/confirm-paid-reservation", handler: "order.confirmPaidReservation", config: { auth: true, policies: [], middlewares: [] } },
    { method: "POST", path: "/orders/:documentId/record-refund", handler: "order.recordRefund", config: { auth: true, policies: [], middlewares: [] } },
    { method: "POST", path: "/orders/:documentId/record-refund-failure", handler: "order.recordRefundFailure", config: { auth: true, policies: [], middlewares: [] } }
  ]
};
