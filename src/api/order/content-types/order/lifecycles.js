'use strict'

const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
const formatAmount = value => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
const safeUrl = value => {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

async function getOrder(strapi, documentId) {
  return strapi.documents('api::order.order').findOne({
    documentId,
    fields: ['reference', 'firstName', 'email', 'totalAmount', 'trackingNumber', 'trackingUrl', 'carrier'],
    populate: { items: { fields: ['productName', 'quantity', 'unitPrice'] } }
  })
}

module.exports = {
  async beforeUpdate(event) {
    const { data, where } = event.params
    if (!where.documentId || (!Object.prototype.hasOwnProperty.call(data, 'paymentStatus') && !Object.prototype.hasOwnProperty.call(data, 'trackingNumber'))) return

    const currentOrder = await strapi.documents('api::order.order').findOne({
      documentId: where.documentId,
      fields: ['paymentStatus', 'trackingNumber', 'confirmationEmailSentAt', 'trackingEmailSentAt']
    })
    if (!currentOrder) return

    event.state.sendConfirmation = data.paymentStatus === 'paid' && !currentOrder.confirmationEmailSentAt
    event.state.sendTracking = Boolean(data.trackingNumber) && !currentOrder.trackingEmailSentAt
  },

  async afterUpdate(event) {
    const documentId = event.result.documentId
    if (!documentId || (!event.state.sendConfirmation && !event.state.sendTracking)) return

    const order = await getOrder(strapi, documentId)
    if (!order) return

    if (event.state.sendConfirmation) {
      const items = order.items.map(item => `<li>${escapeHtml(item.productName)} × ${item.quantity} — ${formatAmount(Number(item.unitPrice) * item.quantity)}</li>`).join('')
      await strapi.plugin('email').service('email').send({
        to: order.email,
        subject: `Commande ${order.reference} confirmée — Maison JLA`,
        text: `Bonjour ${order.firstName}, votre commande ${order.reference} est confirmée. Montant total : ${formatAmount(order.totalAmount)}.`,
        html: `<p>Bonjour ${escapeHtml(order.firstName)},</p><p>Votre commande <strong>${escapeHtml(order.reference)}</strong> est confirmée. Merci infiniment pour votre confiance.</p><ul>${items}</ul><p><strong>Total : ${formatAmount(order.totalAmount)}</strong></p><p>Nous vous écrirons dès son expédition.</p>`
      })
      await strapi.documents('api::order.order').update({ documentId, data: { confirmationEmailSentAt: new Date().toISOString() } })
    }

    if (event.state.sendTracking) {
      const trackingUrl = safeUrl(order.trackingUrl)
      const trackingLink = trackingUrl ? `<p><a href="${escapeHtml(trackingUrl)}">Suivre mon colis</a></p>` : ''
      await strapi.plugin('email').service('email').send({
        to: order.email,
        subject: `Votre commande ${order.reference} est expédiée — Maison JLA`,
        text: `Bonjour ${order.firstName}, votre commande ${order.reference} est expédiée. Numéro de suivi : ${order.trackingNumber}.`,
        html: `<p>Bonjour ${escapeHtml(order.firstName)},</p><p>Votre commande <strong>${escapeHtml(order.reference)}</strong> est expédiée.</p><p>Numéro de suivi : <strong>${escapeHtml(order.trackingNumber)}</strong>${order.carrier ? ` (${escapeHtml(order.carrier)})` : ''}</p>${trackingLink}<p>À très vite,<br>Maison JLA</p>`
      })
      await strapi.documents('api::order.order').update({ documentId, data: { fulfillmentStatus: 'shipped', shippedAt: new Date().toISOString(), trackingEmailSentAt: new Date().toISOString() } })
    }
  }
}
