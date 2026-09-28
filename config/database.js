/** @import { Core } from '@strapi/strapi' */

const path = require('path');
const { isDatabaseClientKind } = require('@strapi/database');

/**
 * Les valeurs par défaut de Strapi ('strapi'/'strapi') sont publiques et
 * documentées. En production, on refuse de démarrer avec ces identifiants :
 * mieux vaut une erreur explicite au déploiement qu'une base ouverte.
 */
function requiredInProduction(env, key, fallback) {
  const value = env(key, fallback);
  if (env('NODE_ENV') === 'production' && value === fallback) {
    throw new Error(
      `La variable d'environnement ${key} doit être définie en production (valeur par défaut '${fallback}' refusée).`
    );
  }
  return value;
}

module.exports = ({ env }) => {
  const client = env('DATABASE_CLIENT', 'sqlite');

  if (!isDatabaseClientKind(client)) {
    throw new Error(
      `Unsupported DATABASE_CLIENT: ${client}. Use "postgres", "mysql", or "sqlite".`
    );
  }

  /** @type {Record<Core.Config.Database.ClientKind, Core.Config.Database['connection']>} */
  const connections = {
    mysql: {
      client: 'mysql',
      connection: {
        host: env('DATABASE_HOST', 'localhost'),
        port: env.int('DATABASE_PORT', 3306),
        database: requiredInProduction(env, 'DATABASE_NAME', 'strapi'),
        user: requiredInProduction(env, 'DATABASE_USERNAME', 'strapi'),
        password: requiredInProduction(env, 'DATABASE_PASSWORD', 'strapi'),
        ssl: env.bool('DATABASE_SSL', false) && {
          key: env('DATABASE_SSL_KEY', undefined),
          cert: env('DATABASE_SSL_CERT', undefined),
          ca: env('DATABASE_SSL_CA', undefined),
          capath: env('DATABASE_SSL_CAPATH', undefined),
          cipher: env('DATABASE_SSL_CIPHER', undefined),
          rejectUnauthorized: env.bool('DATABASE_SSL_REJECT_UNAUTHORIZED', true),
        },
      },
      pool: { min: env.int('DATABASE_POOL_MIN', 2), max: env.int('DATABASE_POOL_MAX', 10) },
    },
    postgres: {
      client: 'postgres',
      connection: {
        connectionString: env('DATABASE_URL'),
        host: env('DATABASE_HOST', 'localhost'),
        port: env.int('DATABASE_PORT', 5432),
        database: requiredInProduction(env, 'DATABASE_NAME', 'strapi'),
        user: requiredInProduction(env, 'DATABASE_USERNAME', 'strapi'),
        password: requiredInProduction(env, 'DATABASE_PASSWORD', 'strapi'),
        ssl: env.bool('DATABASE_SSL', false) && {
          key: env('DATABASE_SSL_KEY', undefined),
          cert: env('DATABASE_SSL_CERT', undefined),
          ca: env('DATABASE_SSL_CA', undefined),
          capath: env('DATABASE_SSL_CAPATH', undefined),
          cipher: env('DATABASE_SSL_CIPHER', undefined),
          rejectUnauthorized: env.bool('DATABASE_SSL_REJECT_UNAUTHORIZED', true),
        },
        schema: env('DATABASE_SCHEMA', 'public'),
      },
      pool: { min: env.int('DATABASE_POOL_MIN', 2), max: env.int('DATABASE_POOL_MAX', 10) },
    },
    sqlite: {
      client: 'sqlite',
      connection: {
        filename: path.join(__dirname, '..', env('DATABASE_FILENAME', '.tmp/data.db')),
      },
      useNullAsDefault: true,
    },
  };

  return {
    connection: {
      ...connections[client],
      acquireConnectionTimeout: env.int('DATABASE_CONNECTION_TIMEOUT', 60000),
    },
  };
};
