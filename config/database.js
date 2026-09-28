/** @import { Core } from '@strapi/strapi' */

const path = require('path');
const { isDatabaseClientKind } = require('@strapi/database');

/**
 * Les valeurs par défaut de Strapi ('strapi'/'strapi') sont publiques et
 * documentées. En production, on refuse de démarrer avec ces identifiants :
 * mieux vaut une erreur explicite au déploiement qu'une base ouverte.
 * Une valeur vide n'est jamais une configuration valide : elle est refusée
 * quel que soit l'environnement.
 */
function requiredComponent(env, key, fallback) {
  const value = env(key, fallback);
  if (String(value ?? '').trim() === '') {
    throw new Error(`La variable d'environnement ${key} ne peut pas être vide.`);
  }
  if (env('NODE_ENV') === 'production' && value === fallback) {
    throw new Error(
      `La variable d'environnement ${key} doit être définie en production (valeur par défaut '${fallback}' refusée).`
    );
  }
  return value;
}

/**
 * Une URL de connexion complète suffit à elle seule : exiger en plus
 * DATABASE_NAME, DATABASE_USERNAME et DATABASE_PASSWORD empêcherait un
 * déploiement pourtant valide (Dokploy) de démarrer. Ces composants ne sont
 * donc validés qu'en l'absence de DATABASE_URL.
 */
function postgresConnection(env) {
  const connectionString = env('DATABASE_URL');
  const ssl = env.bool('DATABASE_SSL', false) && {
    key: env('DATABASE_SSL_KEY', undefined),
    cert: env('DATABASE_SSL_CERT', undefined),
    ca: env('DATABASE_SSL_CA', undefined),
    capath: env('DATABASE_SSL_CAPATH', undefined),
    cipher: env('DATABASE_SSL_CIPHER', undefined),
    rejectUnauthorized: env.bool('DATABASE_SSL_REJECT_UNAUTHORIZED', true),
  };
  const connection = connectionString
    ? { connectionString }
    : {
        host: env('DATABASE_HOST', 'localhost'),
        port: env.int('DATABASE_PORT', 5432),
        database: requiredComponent(env, 'DATABASE_NAME', 'strapi'),
        user: requiredComponent(env, 'DATABASE_USERNAME', 'strapi'),
        password: requiredComponent(env, 'DATABASE_PASSWORD', 'strapi'),
      };

  return {
    ...connection,
    ssl,
    schema: env('DATABASE_SCHEMA', 'public'),
  };
}

/**
 * Chaque connexion n'est construite que pour le client réellement choisi :
 * les construire toutes les trois ferait valider des variables (MySQL,
 * PostgreSQL) qui ne servent pas au démarrage en cours, et empêcherait un
 * déploiement pourtant valide de démarrer.
 *
 * @type {Record<Core.Config.Database.ClientKind, (env: Function) => Core.Config.Database['connection']>}
 */
const connectionBuilders = {
  mysql: (env) => ({
    client: 'mysql',
    connection: {
      host: env('DATABASE_HOST', 'localhost'),
      port: env.int('DATABASE_PORT', 3306),
      database: requiredComponent(env, 'DATABASE_NAME', 'strapi'),
      user: requiredComponent(env, 'DATABASE_USERNAME', 'strapi'),
      password: requiredComponent(env, 'DATABASE_PASSWORD', 'strapi'),
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
  }),
  postgres: (env) => ({
    client: 'postgres',
    connection: postgresConnection(env),
    pool: { min: env.int('DATABASE_POOL_MIN', 2), max: env.int('DATABASE_POOL_MAX', 10) },
  }),
  sqlite: (env) => ({
    client: 'sqlite',
    connection: {
      filename: path.join(__dirname, '..', env('DATABASE_FILENAME', '.tmp/data.db')),
    },
    useNullAsDefault: true,
  }),
};

module.exports = ({ env }) => {
  const client = env('DATABASE_CLIENT', 'sqlite');

  if (!isDatabaseClientKind(client)) {
    throw new Error(
      `Unsupported DATABASE_CLIENT: ${client}. Use "postgres", "mysql", or "sqlite".`
    );
  }

  return {
    connection: {
      ...connectionBuilders[client](env),
      acquireConnectionTimeout: env.int('DATABASE_CONNECTION_TIMEOUT', 60000),
    },
  };
};
