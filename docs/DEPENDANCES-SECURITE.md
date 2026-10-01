# Correctifs de dépendances — 1 octobre 2026

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
