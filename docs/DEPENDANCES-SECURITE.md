# Correctifs MCP et fast-uri — 17 novembre 2026

Les cinq dépendances Strapi directes sont alignées sur 5.58.0, première version de cette série intégrant `@modelcontextprotocol/server` 2.3.1 et `@modelcontextprotocol/node` 2.1.1. Le lockfile résout aussi `@modelcontextprotocol/core` 2.3.1. Les quatre alertes MCP montrées par GitHub ne figurent plus dans `npm audit --omit=dev`. Aucun override MCP ni changement des routes applicatives n'a été nécessaire.

La PR Dependabot `fast-uri` 3.1.6 → 3.1.8 visible dans la capture est dépassée : de nouveaux avis touchent 3.1.8. Le lockfile est mis à jour en 3.1.9, version corrigée pour ces avis, sans ajout d'une dépendance directe.

Validation sous Node 24.22.1 : `npm ci --ignore-scripts`, reconstruction locale de `better-sqlite3`, 35 tests CMS, compilation de l'administration et chargement Strapi en mode production sur une base SQLite temporaire réussis. Le démarrage HTTP local n'a pas pu être testé : le bac à sable interdit l'écoute sur `127.0.0.1`. Le chargement confirme que MCP reste désactivé par défaut dans ce projet. L'avis de validation des arguments volumineux précise que sa limite `maxToolInputElements` doit être configurée si un serveur MCP est activé ; ce projet n'active pas MCP.

À avis npm comparables sur l'ancien et le nouveau lockfile, les paquets signalés passent de 54 (7 critiques) à 49 (3 critiques). Les alertes restantes sont hors du périmètre MCP/fast-uri ; cette correction ne constitue pas un audit de sécurité global. Le déploiement de cette révision n'a pas été contrôlé.

Sources : [Strapi 5.58.0](https://github.com/strapi/strapi/releases/tag/v5.58.0), [avis MCP sur la validation](https://github.com/advisories/GHSA-46jr-4wx8-v453), [avis fast-uri corrigé en 3.1.9](https://github.com/fastify/fast-uri/security/advisories/GHSA-wjr9-j795-jxcr).

# Historique : correctifs de dépendances — 1 octobre 2026

Strapi reste en 5.56.0, dernière version publiée au moment du contrôle. Les modules Strapi demeurent alignés. Aucun `npm audit fix --force`, aucune migration majeure ni modification des schémas/configurations de base.

Trois versions sont fixées explicitement dans `package.json > overrides`, car les dépendances internes Strapi épinglent les versions précédentes :

| Dépendance | Avant | Après |
| --- | --- | --- |
| Axios | 1.19.0 | 1.20.0 |
| DOMPurify | 3.4.13 | 3.4.16 |
| markdown-it | 14.3.0 | 14.3.1 |

Ces remplacements conservent les versions majeures et ont passé les vérifications ci-dessous. Ils ne constituent pas une garantie officielle de compatibilité de Strapi. Réévaluer ces overrides lors des prochaines mises à jour Strapi et les retirer lorsque les contraintes amont intègrent les correctifs.

## Validation

- Installation sans scripts, seulement trois paquets changés dans le lockfile.
- 31 tests CMS réussis sous Node 22.23.2.
- Compilation administration réussie. Le bac à sable a empêché la lecture des préférences CLI utilisateur ; ce message n'a pas empêché la compilation.
- Démarrage réel avec SQLite temporaire vide, fichier .env désactivé, identifiants factices et cron désactivé : réussi.
- HTTP local : `/_health` 204 ; `/admin` et `/admin/init` 200 ; `/api/users` et recherche de commande fictive sans authentification 403.
- Arrêt propre et suppression de la base temporaire. Aucune base existante utilisée.
- Arbre npm résolu avec les trois overrides et contrôle des différences Git réussis.

Validation complémentaire : connexion d'un administrateur temporaire, lecture de son profil et création/modification/suppression d'un brouillon produit via les routes Content Manager avec Axios 1.20.0 réussies. Ces actions ont exclusivement utilisé une base temporaire vide, ensuite supprimée. Elles ne remplacent pas une vérification visuelle complète du navigateur ni les parcours externes paiement/livraison. Aucun service externe métier n'a été sollicité et aucun déploiement n'a été effectué.

Le démarrage isolé confirme également `environment=production`, le fournisseur email Resend actif et l'absence de chargement de Nodemailer dans le processus.

## Alertes restantes

`npm audit --omit=dev` : 21 paquets signalés, 4 élevés et 17 modérés, aucun critique ou faible. Avant : 25 paquets, 8 élevés, 16 modérés, 1 faible. Les sévérités des parents sont recalculées quand leurs dépendances sont corrigées, ce qui explique la hausse du compteur modéré.

Les avis propres restants concernent esbuild, Nodemailer, React Router, stream-json, Vite et webpack-dev-middleware ; les autres entrées sont des propagations dans l'arbre Strapi. Les correctifs proposés par npm nécessitent des changements majeurs ou une rétrogradation Strapi incompatible avec le projet.

Les avis élevés restants concernent notamment les serveurs de développement Vite/webpack et Nodemailer. Le projet configure Resend comme fournisseur mail. Les serveurs de développement ne doivent pas être exposés en production. Les autres bibliothèques restent à surveiller ; l'absence de chemin d'exploitation public établi lors de l'inspection n'est pas une preuve d'innocuité.

Qualification complémentaire des avis :

- L'avis stream-json GHSA-528h-pc64-c93x vise les filtres pick/ignore/filter/replace. Les imports trouvés dans le code Strapi installé concernent les utilitaires JSONL Parser/Stringer, pas ces filtres. Aucun usage des filtres concernés trouvé dans les modules Strapi inspectés.
- L'avis React Router GHSA-337j-9hxr-rhxg concerne l'hydratation SSR. L'administration installée utilise `createBrowserRouter` ; la boutique utilise Nuxt/Vue. Le mécanisme SSR concerné n'a pas été identifié dans ces applications.
- L'autre avis React Router, GHSA-wrjc-x8rr-h8h6, concerne les destinations de navigation. Le retour de connexion Strapi filtre notamment les URL externes et les variantes à antislash ; cela ne suffit pas à certifier toutes les navigations de l'administration.

Ces qualifications expliquent pourquoi un compteur npm non nul n'équivaut pas automatiquement à une faille publique exploitable. Elles ne permettent pas de certifier la configuration de la production à distance.

Pour lever les réserves opérationnelles : vérifier la révision réellement déployée, le mode des processus et les ports exposés, les règles du proxy relatives aux IP client, les accès administrateur/jetons, puis la sauvegarde et une restauration isolée. Aucun feu vert sans réserve n'est délivré à ce stade.

L'utilisateur a fourni l'URL du projet Dokploy et deux captures du stockage `dokploy-backups/maison-jla-db-wtjrek/maisonjla-db/`. Elles montrent plusieurs fichiers `.sql.gz`, notamment les 18, 19 et 20 septembre 2026 (21 partiellement visible). L'existence de fichiers de sauvegarde est donc étayée ; la capture ne montre pas nécessairement les plus récents et ne prouve ni leur intégrité ni une restauration réussie. L'accès au lien Dokploy a été tenté : redirection vers la page Sign in dans le navigateur disponible. Authentification utilisateur nécessaire pour poursuivre les contrôles.

## Sources

- [Axios 1.20.0](https://github.com/axios/axios/releases/tag/v1.20.0)
- [DOMPurify 3.4.16](https://github.com/cure53/DOMPurify/releases/tag/3.4.16)
- [markdown-it 14.3.1](https://github.com/markdown-it/markdown-it/releases/tag/14.3.1)

Avis de lancement : favorable sur le périmètre applicatif contrôlé après déploiement des correctifs Web et CMS, avec les réserves ci-dessus. Aucune promesse de sécurité absolue ; configuration VPS, sauvegardes et exposition réseau interne non validées.
