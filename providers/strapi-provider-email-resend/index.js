"use strict";

const { Resend } = require("resend");

module.exports = {
  provider: "resend",
  name: "Resend",

  init(providerOptions, settings) {
    const resend = new Resend(providerOptions.apiKey);

    return {
      async send(options) {
        const {
          from,
          to,
          cc,
          bcc,
          replyTo,
          subject,
          text,
          html,
          attachments,
        } = options;

        const { data, error } = await resend.emails.send({
          from: from || settings.defaultFrom,
          to,
          cc,
          bcc,
          replyTo: replyTo || settings.defaultReplyTo,
          subject,
          text,
          html,
          attachments,
        });

        if (error) {
          throw new Error(error.message || "Échec de l'envoi Resend");
        }

        return data;
      },
    };
  },
};
