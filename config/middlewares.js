const defaultOrigins = [
  "https://maisonjla.lafabriqueducode.fr",
  "https://maisonjla.fr",
  "https://www.maisonjla.fr",
  ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000"]),
];
const corsOrigins = (process.env.CORS_ORIGINS || defaultOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

module.exports = [
  "strapi::logger",
  "strapi::errors",
  {
    name: "strapi::security",
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "connect-src": ["'self'"],
          "img-src": [
            "'self'",
            "data:",
            "blob:",
            "market-assets.strapi.io",
            "https://res.cloudinary.com",
          ],
          "media-src": [
            "'self'",
            "data:",
            "blob:",
            "market-assets.strapi.io",
            "https://res.cloudinary.com",
          ],
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  {
    name: "strapi::cors",
    config: {
      origin: corsOrigins,
      methods: ["GET", "POST", "PUT", "DELETE"],
      headers: ["Content-Type", "Authorization"],
      credentials: false,
      keepHeaderOnError: true,
    },
  },
  "strapi::query",
  {
    name: "strapi::body",
    config: {
      jsonLimit: "32kb",
      formLimit: "32kb",
      formidable: {
        maxFileSize: 5 * 1024 * 1024,
        maxTotalFileSize: 5 * 1024 * 1024,
        maxFields: 20,
      },
      // Sendcloud signe les octets exacts du corps HTTP. Koa doit donc les conserver.
      includeUnparsed: true,
    },
  },
  "strapi::session",
  "strapi::favicon",
  "strapi::public",
];
