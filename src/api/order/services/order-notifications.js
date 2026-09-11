"use strict";

const escapeHtml = (value) =>
  String(value || "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );

const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

const emailSender = () => ({
  from: process.env.RESEND_FROM || process.env.RESEND_REPLY_TO,
  replyTo: process.env.RESEND_REPLY_TO || process.env.RESEND_FROM,
});

function emailLayout(order, title, content, trackingUrl) {
  const url = safeUrl(trackingUrl);
  const action = url
    ? `<p style="margin:26px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 22px;background:#302722;color:#ffffff;text-decoration:none">Suivre mon colis</a></p>`
    : "";

  return `<div style="margin:0;padding:40px 20px;background:#f5eee6;font-family:Arial,sans-serif;color:#302722"><div style="max-width:600px;margin:0 auto;background:#ffffff"><div style="padding:32px;text-align:center;border-bottom:1px solid #e9ddd3"><div style="font-family:Georgia,serif;font-size:30px">Maison JLA</div></div><div style="padding:32px"><h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:26px;font-weight:normal">${escapeHtml(title)}</h1><p>Bonjour ${escapeHtml(order.firstName)},</p>${content}${action}<p style="margin-top:28px">À très vite,<br>Maison JLA</p></div><div style="padding:18px 32px;border-top:1px solid #e9ddd3;text-align:center;font-size:12px;color:#776b64">Maison JLA — Julia Touret EI<br>5 Rue Joliot-Curie — 80200 Doingt<br>contact@maisonjla.fr — 06 77 88 69 09</div></div></div>`;
}

function formatCarrierDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: "Europe/Paris",
  }).format(date);
}

function carrierStatusLabel(value) {
  const label = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const known = [
    [/ready to send|etiquette|announced/, "Étiquette créée, colis annoncé au transporteur"],
    [/shipment picked up|picked up by driver/, "Prise en charge par le transporteur"],
    [/en route to sorting|sorting cent/, "En route vers le centre de tri"],
    [/being sorted|sorted/, "En cours de tri"],
    [/parcel en route|shipment on route|in transit|en cours de livraison/, "En cours d’acheminement"],
    [/out for delivery|driver en route/, "En cours de livraison"],
    [/awaiting customer pickup|ready (for|at) pickup|point relais/, "Disponible en point relais"],
    [/delivered|livre/, "Livré"],
  ];
  for (const [pattern, french] of known) {
    if (pattern.test(label)) return french;
  }
  return String(value || "").trim();
}

function shipmentDetailsBox(order, reference) {
  const rows = [];
  const carrier = order.carrier || order.shipmentName;
  if (carrier) rows.push(`<p style="margin:0 0 8px"><strong>Transporteur :</strong> ${escapeHtml(carrier)}</p>`);
  if (order.carrierStatus) {
    rows.push(
      `<p style="margin:0 0 8px"><strong>Statut :</strong> ${escapeHtml(carrierStatusLabel(order.carrierStatus))}</p>`,
    );
  }
  if (order.deliveryMethod === "pickup") {
    rows.push(
      `<p style="margin:0 0 8px"><strong>Livraison :</strong> point relais ${escapeHtml(order.pickupPoint || "sélectionné")}</p>`,
    );
  } else {
    const city = [order.postalCode, order.city || order.destinationCity].filter(Boolean).join(" ");
    if (city) rows.push(`<p style="margin:0 0 8px"><strong>Livraison :</strong> à domicile, ${escapeHtml(city)}</p>`);
  }
  if (order.expectedDeliveryDate) {
    rows.push(
      `<p style="margin:0 0 8px"><strong>Livraison estimée :</strong> ${escapeHtml(formatCarrierDate(order.expectedDeliveryDate))}</p>`,
    );
  }
  if (order.trackingNumber) {
    rows.push(`<p style="margin:0"><strong>Numéro de suivi :</strong><br>${escapeHtml(order.trackingNumber)}</p>`);
  }
  return `<div style="margin:18px 0;padding:18px;background:#fdf7f2">${rows.join("")}</div>`;
}

function buildOrderNotification(order, type) {
  const reference = escapeHtml(order.reference);
  const carrier = order.carrier ? ` avec ${escapeHtml(order.carrier)}` : "";
  const trackingNumber = shipmentDetailsBox(order, reference);
  const pickupPoint = escapeHtml(order.pickupPoint || "votre point relais");
  const statusLine = order.carrierStatus
    ? ` Statut : ${carrierStatusLabel(order.carrierStatus)}.`
    : "";
  const estimated = order.expectedDeliveryDate
    ? ` Livraison estimée : ${formatCarrierDate(order.expectedDeliveryDate)}.`
    : "";

  const notifications = {
    shipped: {
      subject: `Votre commande ${order.reference} est expédiée — Maison JLA`,
      title: "Votre commande est en route",
      text: `Bonjour ${order.firstName}, votre commande ${order.reference} a été confiée au transporteur${order.carrier ? ` avec ${order.carrier}` : ""}.${order.trackingNumber ? ` Numéro de suivi : ${order.trackingNumber}.` : ""}${safeUrl(order.trackingUrl) ? ` Suivre le colis : ${safeUrl(order.trackingUrl)}` : ""}`,
      content: `<p>Votre commande <strong>${reference}</strong> a été confiée au transporteur${carrier}.</p>${trackingNumber}`,
    },
    in_transit: {
      subject: `Votre commande ${order.reference} est en cours de livraison — Maison JLA`,
      title: "Votre commande est en cours de livraison",
      text: `Bonjour ${order.firstName}, votre commande ${order.reference} est en cours d’acheminement${order.carrier ? ` avec ${order.carrier}` : ""}.${statusLine}${order.trackingNumber ? ` Numéro de suivi : ${order.trackingNumber}.` : ""}${estimated}${safeUrl(order.trackingUrl) ? ` Suivre le colis : ${safeUrl(order.trackingUrl)}` : ""}`,
      content: `<p>Votre commande <strong>${reference}</strong> a été prise en charge et est actuellement en cours de livraison${carrier}.</p>${trackingNumber}`,
    },
    pickup: {
      subject: `Votre commande ${order.reference} est arrivée au point relais — Maison JLA`,
      title: "Votre commande vous attend",
      text: `Bonjour ${order.firstName}, votre commande ${order.reference} est disponible au point relais ${order.pickupPoint || "sélectionné"}. Pensez à prendre une pièce d'identité.`,
      content: `<p>Votre commande <strong>${reference}</strong> est disponible au point relais <strong>${pickupPoint}</strong>.</p><p>Pensez à prendre une pièce d’identité et à respecter le délai de garde indiqué par le transporteur.</p>${trackingNumber}`,
    },
    delayed: {
      subject: `Un délai pour votre commande ${order.reference} — Maison JLA`,
      title: "Votre livraison prend un peu de retard",
      text: `Bonjour ${order.firstName}, le transporteur nous signale un retard pour la commande ${order.reference}. Vous pouvez consulter le suivi pour les dernières informations.`,
      content: `<p>Le transporteur nous signale un retard pour votre commande <strong>${reference}</strong>.</p><p>Nous restons attentifs à son acheminement. Le suivi ci-dessous contient les informations les plus récentes.</p>${trackingNumber}`,
    },
    issue: {
      subject: `Information importante pour votre commande ${order.reference} — Maison JLA`,
      title: "Une action peut être nécessaire",
      text: `Bonjour ${order.firstName}, le transporteur rencontre une difficulté pour livrer la commande ${order.reference}. Consultez le suivi ou répondez à cet e-mail si vous avez besoin d'aide.`,
      content: `<p>Le transporteur rencontre une difficulté pour livrer votre commande <strong>${reference}</strong>.</p><p>Consultez le suivi pour connaître la marche à suivre. Vous pouvez aussi répondre directement à cet e-mail : nous vous aiderons.</p>${trackingNumber}`,
    },
    delivered: {
      subject: `Votre commande ${order.reference} a été livrée — Maison JLA`,
      title: "Votre commande a été livrée",
      text: `Bonjour ${order.firstName}, la commande ${order.reference} est indiquée comme livrée. Merci pour votre confiance. Si vous ne l'avez pas reçue, répondez à cet e-mail.`,
      content: `<p>Votre commande <strong>${reference}</strong> est indiquée comme livrée.</p><p>Merci pour votre confiance. Si vous ne l’avez pas reçue, répondez simplement à cet e-mail afin que nous puissions vous aider.</p>`,
    },
  };

  const notification = notifications[type];
  if (!notification) return null;
  return {
    subject: notification.subject,
    text: notification.text,
    html: emailLayout(
      order,
      notification.title,
      notification.content,
      order.trackingUrl,
    ),
  };
}

async function sendOrderNotification(strapi, order, type) {
  const email = buildOrderNotification(order, type);
  if (!email) return false;

  await strapi.plugin("email").service("email").send({
    ...emailSender(),
    to: order.email,
    ...email,
  });
  return true;
}

module.exports = {
  buildOrderNotification,
  carrierStatusLabel,
  safeUrl,
  sendOrderNotification,
};
