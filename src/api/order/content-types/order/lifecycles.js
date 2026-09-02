'use strict'

const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
const formatAmount = value => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))
const emailSender = () => ({
  from: process.env.RESEND_FROM,
  replyTo: process.env.RESEND_REPLY_TO || process.env.RESEND_FROM
})
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
    fields: ['reference', 'firstName', 'email', 'totalAmount', 'trackingNumber', 'trackingUrl', 'carrier', 'stockDecrementedAt'],
    populate: { items: { fields: ['productDocumentId', 'productName', 'quantity', 'unitPrice'] } }
  })
}

async function decrementStock(strapi, order) {
  const products = await Promise.all(order.items.map(item =>
    strapi.documents('api::product.product').findOne({
      documentId: item.productDocumentId,
      fields: ['name', 'stock']
    })
  ))

  const unavailableItem = order.items.find((item, index) => !products[index] || !Number.isInteger(products[index].stock) || products[index].stock < item.quantity)
  if (unavailableItem) {
    strapi.log.error(`Stock insuffisant après paiement pour la commande ${order.reference} : ${unavailableItem.productName}`)
    return false
  }

  await Promise.all(order.items.map((item, index) =>
    strapi.documents('api::product.product').update({
      documentId: products[index].documentId,
      data: { stock: products[index].stock - item.quantity }
    })
  ))

  await strapi.documents('api::order.order').update({
    documentId: order.documentId,
    data: { stockDecrementedAt: new Date().toISOString() }
  })

  strapi.log.info(`Stock décrémenté pour la commande ${order.reference}`)
  return true
}

function confirmationEmail(order) {
  const items = order.items.map(item => `<li style="margin:0 0 8px">${escapeHtml(item.productName)} × ${item.quantity} — ${formatAmount(Number(item.unitPrice) * item.quantity)}</li>`).join('')

  return {
    subject: `Commande ${order.reference} confirmée — Maison JLA`,
    text: `Bonjour ${order.firstName}, votre commande ${order.reference} est confirmée. Montant total : ${formatAmount(order.totalAmount)}. Nous vous écrirons dès son expédition.`,
    html: `<div style="margin:0;padding:40px 20px;background:#f5eee6;font-family:Arial,sans-serif;color:#302722"><div style="max-width:600px;margin:0 auto;background:#ffffff"><div style="padding:32px;text-align:center;border-bottom:1px solid #e9ddd3"><div style="font-family:Georgia,serif;font-size:30px;color:#302722">Maison JLA</div></div><div style="padding:32px"><h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:26px;font-weight:normal">Votre commande est confirmée</h1><p>Bonjour ${escapeHtml(order.firstName)},</p><p>Merci infiniment pour votre confiance. Votre commande <strong>${escapeHtml(order.reference)}</strong> a bien été confirmée.</p><div style="margin:26px 0;padding:20px;background:#fdf7f2"><p style="margin:0 0 12px;font-weight:bold">Votre sélection</p><ul style="margin:0;padding-left:18px">${items}</ul><p style="margin:18px 0 0;font-weight:bold">Total réglé : ${formatAmount(order.totalAmount)}</p></div><p>Nous vous écrirons dès que votre commande sera expédiée.</p><p>À très vite,<br>Maison JLA</p></div><div style="padding:18px 32px;border-top:1px solid #e9ddd3;text-align:center;font-size:12px;color:#776b64">Maison JLA<br>11 rue de la Gare — 80360 Guillemont</div></div></div>`
  }
}

module.exports = {
  async beforeUpdate(event) {
    const { data, where } = event.params
    if (!where.documentId || (!Object.prototype.hasOwnProperty.call(data, 'paymentStatus') && !Object.prototype.hasOwnProperty.call(data, 'trackingNumber'))) return

    const currentOrder = await strapi.documents('api::order.order').findOne({
      documentId: where.documentId,
      fields: ['paymentStatus', 'trackingNumber', 'confirmationEmailSentAt', 'trackingEmailSentAt', 'stockDecrementedAt']
    })
    if (!currentOrder) return

    event.state.sendConfirmation = data.paymentStatus === 'paid' && !currentOrder.confirmationEmailSentAt
    event.state.decrementStock = data.paymentStatus === 'paid' && !currentOrder.stockDecrementedAt
    event.state.sendTracking = Boolean(data.trackingNumber) && !currentOrder.trackingEmailSentAt
  },

  async afterUpdate(event) {
    const documentId = event.result.documentId
    if (!documentId || (!event.state.sendConfirmation && !event.state.sendTracking && !event.state.decrementStock)) return

    const order = await getOrder(strapi, documentId)
    if (!order) return

    if (event.state.decrementStock) await decrementStock(strapi, order)

    if (event.state.sendConfirmation) {
      const email = confirmationEmail(order)
      await strapi.plugin('email').service('email').send({
        ...emailSender(),
        to: order.email,
        ...email
      })
      await strapi.documents('api::order.order').update({ documentId, data: { confirmationEmailSentAt: new Date().toISOString() } })
      strapi.log.info(`E-mail de confirmation envoyé pour la commande ${order.reference}`)
    }

    if (event.state.sendTracking) {
      const trackingUrl = safeUrl(order.trackingUrl)
      const trackingLink = trackingUrl ? `<p><a href="${escapeHtml(trackingUrl)}">Suivre mon colis</a></p>` : ''
      await strapi.plugin('email').service('email').send({
        ...emailSender(),
        to: order.email,
        subject: `Votre commande ${order.reference} est expédiée — Maison JLA`,
        text: `Bonjour ${order.firstName}, votre commande ${order.reference} est expédiée. Numéro de suivi : ${order.trackingNumber}.`,
        html: `<p>Bonjour ${escapeHtml(order.firstName)},</p><p>Votre commande <strong>${escapeHtml(order.reference)}</strong> est expédiée.</p><p>Numéro de suivi : <strong>${escapeHtml(order.trackingNumber)}</strong>${order.carrier ? ` (${escapeHtml(order.carrier)})` : ''}</p>${trackingLink}<p>À très vite,<br>Maison JLA</p>`
      })
      await strapi.documents('api::order.order').update({ documentId, data: { fulfillmentStatus: 'shipped', shippedAt: new Date().toISOString(), trackingEmailSentAt: new Date().toISOString() } })
    }
  }
}
