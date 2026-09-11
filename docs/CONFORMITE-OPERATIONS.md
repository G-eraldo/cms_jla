# Registre opérationnel — conformité Maison JLA

Ce registre est un modèle de travail interne. Il ne remplace ni le registre RGPD formel, ni la validation d'un conseil juridique ou comptable.

## Avant toute mise en vente

- Immatriculation confirmée par l’éditrice : SIREN 109 541 771, SIRET 109 541 771 00019, RCS Amiens 109 541 771. Conserver l’extrait officiel au dossier. Mettre à jour mentions légales, CGV, factures et e-mails uniquement à partir de ce justificatif.
- Hébergement confirmé : le frontend, Strapi et la base sont exploités sur le VPS IONOS de l’éditrice. Conserver le contrat IONOS ainsi que les contrats de sous-traitance, régions de traitement, sous-traitants ultérieurs et mécanismes de transfert hors EEE de Mollie, Resend, Sendcloud, Cloudinary et ntfy.
- Convention CM2C signée : conserver l'attestation d'adhésion avec les pièces de conformité.
- Créer un jeton Strapi limité au serveur Nuxt : réservation, confirmation, lecture restreinte des commandes, rétractations et validation des codes promo. Il ne doit pas être un jeton « Full Access » et doit être expirant.
- Renseigner `MOLLIE_API_KEY` aussi dans Strapi : la confirmation d'une commande payée vérifie le paiement chez Mollie avant de figer le stock.

## Dossier de conformité par référence ou lot de bijou

Conserver dans un dossier à accès restreint relié aux champs Strapi `supplierName`, `supplierReference`, `productReference`, `batchNumber` et `riskAssessmentReference` :

1. facture/bon de livraison du fournisseur, identification et date d'achat ;
2. déclaration de conformité et composition exacte ;
3. résultats d'autocontrôle ou rapports d'essai REACH applicables (nickel, cadmium, plomb ; chrome VI/couleurs azoïques si cuir ou textile) ;
4. analyse de risques, avertissements, décisions de mise sur le marché et photos d'étiquetage ;
5. quantités reçues et vendues, ainsi que les références de commandes concernées ;
6. procédure de retrait/rappel : responsable, liste clients affectés, modèle de message, signalement RappelConso lorsque requis et conservation de la décision.

Ne pas employer « or », « argent », « plaqué », « vermeil », « pierre précieuse » ou une allégation de conformité sans justificatif adapté. Pour des bijoux fantaisie, la fiche et l'étiquette doivent au minimum donner la dénomination et les principaux matériaux.

## Conservation et droits RGPD

| Données | Base/finalité | Base active | Archivage intermédiaire |
| --- | --- | --- | --- |
| Commande, livraison, SAV | Exécution du contrat | Jusqu'à clôture du SAV | 5 ans pour le contentieux potentiel ; accès restreint |
| Facture et pièce comptable | Obligation légale | Traitement comptable | 10 ans après clôture de l'exercice |
| Contrat électronique >= 120 € | Obligation légale | Exécution | 10 ans à partir de la livraison ou de l'exécution |
| Rétractation | Obligation légale / preuve | Jusqu'à clôture | 5 ans après clôture, sauf contentieux |
| Commande non payée | Intérêt légitime de sécurité | Réservation en cours | Suppression/anonymisation sous 30 jours |

Documenter dans le registre des traitements les destinataires, les pays, DPA/SCC éventuels, habilitations, sauvegardes, procédure de violation et procédure de réponse aux droits. Répondre aux demandes d'exercice des droits à `contact@maisonjla.fr` après vérification proportionnée de l'identité.

## Factures et contrats

Les commandes enregistrent la version, l'empreinte et une copie des CGV acceptées côté serveur. Les factures payées reçoivent un numéro unique annuel, une date d'émission et une copie structurée hachée.

Les factures PDF sont générées par Strapi puis archivées dans le bucket R2 privé `CLOUDFLARE_R2_INVOICES_BUCKET`, sous la clé `invoices/AAAA/FAC-AAAA-XXXXXX.pdf`. Le bucket ne doit pas avoir de domaine public, ni de règle CORS pour le navigateur. Strapi conserve séparément la clé, la date d'archivage et le hash SHA-256 du PDF.

Avant la mise en production, créer un bucket dédié et, dans **R2 > bucket > Settings**, ajouter une règle **Bucket lock** sur le préfixe `invoices/` pour une conservation de 3 650 jours (10 ans). Créer une clé API R2 limitée en lecture/écriture à ce seul bucket, puis renseigner les quatre variables `CLOUDFLARE_R2_*` dans les secrets du CMS. Ne jamais les placer dans Nuxt ou dans un fichier commité. Une absence de ces variables bloque l'envoi de la confirmation en production afin d'éviter une facture non archivée.
