const allowedImageFormats = ["jpg", "jpeg", "png", "webp"];

module.exports = ({ env }) => ({
  upload: {
    config: {
      provider: "cloudinary",
      providerOptions: {
        CLOUDINARY_URL: env("CLOUDINARY_URL"),
      },
      actionOptions: {
        // The media library is exclusively for product images. Cloudinary checks
        // the uploaded asset and rejects SVG, documents, audio and executable types.
        upload: { resource_type: "image", allowed_formats: allowedImageFormats },
        uploadStream: { resource_type: "image", allowed_formats: allowedImageFormats },
        delete: {},
      },
    },
  },
  email: {
    config: {
      provider: "strapi-provider-email-resend",
      providerOptions: {
        apiKey: env("RESEND_API_KEY"), // Required
      },
      settings: {
        defaultFrom: env("RESEND_FROM"),
        defaultReplyTo: env("RESEND_REPLY_TO", env("RESEND_FROM")),
      },
    },
  },
  "users-permissions": {
    config: {
      jwtManagement: "refresh",
      sessions: {
        httpOnly: true,
      },
    },
  },
});
