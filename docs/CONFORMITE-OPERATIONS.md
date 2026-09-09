# Registre opérationnel — conformité Maison JLA

Ce registre est un modèle de travail interne. Il ne remplace ni le registre RGPD formel, ni la validation d'un conseil juridique ou comptable.

## Avant toute mise en vente

- Obtenir et archiver l'extrait officiel RNE/SIRENE ou Kbis : SIREN, SIRET, forme, RCS et ville du greffe. Mettre à jour les mentions légales, CGV, factures et e-mails uniquement à partir de ce justificatif.
- Hébergement confirmé : le frontend, Strapi et la base sont exploités sur le VPS IONOS de l’éditrice. Conserver le contrat IONOS ainsi que les contrats de sous-traitance, régions de traitement, sous-traitants ultérieurs et mécanismes de transfert hors EEE de Mollie, Resend, Sendcloud, Cloudinary et ntfy.
- Convention CM2C signée : conserver l'attestation d'adhésion avec les pièces de conformité.
- Créer un jeton Strapi limité au serveur Nuxt : création/lecture/mise à jour des seules commandes, rétractations et produits nécessaires. Il ne doit pas être un jeton « Full Access » et doit être expirant.

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

Documenter dans le registre des traitements les destinataires, les pays, DPA/SCC éventuels, habilitations, sauvegardes, procédure de violation et procédure de réponse aux droits. Répondre aux demandes d'exercice des droits à `maisonjla@outlook.com` après vérification proportionnée de l'identité.

## Factures et contrats

Les commandes enregistrent la version, l'empreinte et une copie des CGV acceptées côté serveur. Les factures payées reçoivent un numéro unique annuel, une date d'émission et une copie structurée hachée. La sauvegarde chiffrée et la procédure de restauration des archives restent à configurer et à tester avant ouverture.
