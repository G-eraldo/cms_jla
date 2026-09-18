module.exports = ({ env }) => ({
  upload: {
    config: {
      provider: "aws-s3",
      providerOptions: {
        // URLs stored by Strapi use the public R2 custom domain, never the S3 API endpoint.
        baseUrl: env("CLOUDFLARE_R2_MEDIA_PUBLIC_URL"),
        s3Options: {
          region: "auto",
          endpoint: env("CLOUDFLARE_R2_MEDIA_ENDPOINT"),
          forcePathStyle: true,
          credentials: {
            accessKeyId: env("CLOUDFLARE_R2_MEDIA_ACCESS_KEY_ID"),
            secretAccessKey: env("CLOUDFLARE_R2_MEDIA_SECRET_ACCESS_KEY"),
          },
          params: {
            Bucket: env("CLOUDFLARE_R2_MEDIA_BUCKET"),
            // R2 does not support S3 object ACLs; visibility is managed by the R2 domain.
            ACL: undefined,
          },
        },
      },
      actionOptions: { upload: {}, uploadStream: {}, delete: {} },
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
