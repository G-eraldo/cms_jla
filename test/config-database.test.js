"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const databaseConfig = require("../config/database");

/**
 * Reproduit le helper `env` de Strapi : une variable présente dans
 * l'environnement l'emporte sur la valeur par défaut, même quand elle est vide.
 */
function fakeEnv(values = {}) {
  const present = (key) => Object.prototype.hasOwnProperty.call(values, key);
  const env = (key, fallback) => (present(key) ? values[key] : fallback);
  env.int = (key, fallback) =>
    present(key) ? Number.parseInt(values[key], 10) : fallback;
  env.bool = (key, fallback) =>
    present(key) ? String(values[key]) === "true" : fallback;
  return env;
}

const load = (values) => databaseConfig({ env: fakeEnv(values) });

const production = {
  NODE_ENV: "production",
  DATABASE_CLIENT: "postgres",
};

test("une URL de connexion suffit à démarrer en production", () => {
  const { connection } = load({
    ...production,
    DATABASE_URL: "postgres://jla:secret@db:5432/maison",
  });

  assert.equal(connection.client, "postgres");
  assert.equal(
    connection.connection.connectionString,
    "postgres://jla:secret@db:5432/maison",
  );
  assert.equal("database" in connection.connection, false);
  assert.equal("user" in connection.connection, false);
  assert.equal("password" in connection.connection, false);
});

test("avec DATABASE_URL, les composants ne sont même pas lus", () => {
  const { connection } = load({
    ...production,
    DATABASE_URL: "postgres://jla:secret@db:5432/maison",
    DATABASE_NAME: "",
    DATABASE_USERNAME: "",
    DATABASE_PASSWORD: "",
  });

  assert.equal(
    connection.connection.connectionString,
    "postgres://jla:secret@db:5432/maison",
  );
});

test("sans URL en production, les identifiants publics sont refusés", () => {
  assert.throws(() => load(production), /DATABASE_NAME/);
});

test("sans URL en production, des composants réels démarrent", () => {
  const { connection } = load({
    ...production,
    DATABASE_NAME: "maison",
    DATABASE_USERNAME: "jla",
    DATABASE_PASSWORD: "secret",
  });

  assert.equal(connection.connection.database, "maison");
  assert.equal(connection.connection.user, "jla");
  assert.equal(connection.connection.password, "secret");
  assert.equal("connectionString" in connection.connection, false);
});

test("un composant vide est refusé en production", () => {
  assert.throws(
    () =>
      load({
        ...production,
        DATABASE_NAME: "maison",
        DATABASE_USERNAME: "jla",
        DATABASE_PASSWORD: "",
      }),
    /DATABASE_PASSWORD ne peut pas être vide/,
  );
});

test("un composant vide est refusé hors production", () => {
  assert.throws(
    () =>
      load({
        DATABASE_CLIENT: "postgres",
        DATABASE_NAME: "  ",
        DATABASE_USERNAME: "jla",
        DATABASE_PASSWORD: "secret",
      }),
    /DATABASE_NAME ne peut pas être vide/,
  );
});

test("hors production, les valeurs par défaut restent acceptées", () => {
  const { connection } = load({ DATABASE_CLIENT: "postgres" });

  assert.equal(connection.connection.database, "strapi");
  assert.equal(connection.connection.user, "strapi");
});

test("mysql est validé de la même façon", () => {
  assert.throws(
    () => load({ NODE_ENV: "production", DATABASE_CLIENT: "mysql" }),
    /DATABASE_NAME/,
  );
});

test("sqlite ne demande aucun identifiant", () => {
  const { connection } = load({ NODE_ENV: "production" });

  assert.equal(connection.client, "sqlite");
});
