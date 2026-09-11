"use strict";

const { createHash } = require("node:crypto");
const PDFDocument = require("pdfkit");

const TERMS_VERSION = "8 septembre 2026";

const TERMS_SECTIONS = [
  {
    title: "1. Vendeuse et champ d'application",
    paragraphs: [
      "La vendeuse est Julia Touret, entrepreneur individuel exerçant sous le nom commercial Maison JLA, 5 Rue Joliot-Curie, 80200 Doingt, France. SIREN : 109 541 771. SIRET : 109 541 771 00019. Immatriculation RCS : 109 541 771. E-mail : contact@maisonjla.fr. Téléphone : 06 77 88 69 09.",
      "Les présentes conditions générales de vente s'appliquent aux ventes en ligne de bijoux fantaisie artisanaux, assemblés, fabriqués ou revendus par Maison JLA, conclues avec des consommateurs en France métropolitaine.",
    ],
  },
  {
    title: "2. Produits et disponibilité",
    paragraphs: [
      "Les caractéristiques essentielles, matières, dimensions, photographies et prix de chaque produit figurent sur sa fiche. De légères différences de couleur ou d'aspect peuvent résulter de l'écran ou du caractère artisanal d'une pièce, sans affecter ses caractéristiques essentielles.",
      "Les offres sont valables tant qu'elles sont visibles, dans la limite des stocks disponibles. Si une indisponibilité est constatée après paiement, Maison JLA en informe le client et rembourse le produit indisponible.",
    ],
  },
  {
    title: "3. Commande sans compte",
    paragraphs: [
      "Le client compose son panier, peut le corriger, renseigne ses coordonnées et choisit sa livraison. Aucun compte, espace personnel ou historique en ligne n'est créé. Avant de payer, il vérifie les produits, les quantités, le prix total, les frais et les informations saisies, puis accepte les CGV au moyen d'une case non précochée.",
      "La vente devient définitive après confirmation du paiement par Mollie. Maison JLA adresse alors un e-mail récapitulatif comprenant la facture et la présente version des CGV. Maison JLA peut refuser ou annuler une commande pour un motif légitime, notamment une fraude suspectée, un paiement refusé, une indisponibilité ou un litige de paiement antérieur.",
    ],
  },
  {
    title: "4. Prix",
    paragraphs: [
      "Les prix applicables sont ceux affichés en euros au moment de la commande. TVA non applicable, article 293 B du Code général des impôts. Les prix affichés correspondent au prix net à payer, hors livraison.",
      "Les frais sont affichés avant paiement : 3,90 EUR en point relais et 7,90 EUR à domicile sous 60 EUR de produits ; livraison offerte à partir de 60 EUR de produits. Le montant total dû est présenté avant validation.",
    ],
  },
  {
    title: "5. Paiement",
    paragraphs: [
      "Le prix est payable comptant et en totalité. Le paiement est traité sur la page sécurisée de Mollie, qui indique les moyens effectivement disponibles. Maison JLA ne collecte ni ne conserve les données de carte bancaire. La commande n'est confirmée qu'après encaissement effectif.",
    ],
  },
  {
    title: "6. Livraison",
    paragraphs: [
      "Les produits sont livrés en France métropolitaine, à l'adresse indiquée ou au point relais choisi. Le délai prévu est de 3 à 6 jours ouvrés à compter de la confirmation du paiement.",
      "En cas de retard, le client peut demander une livraison dans un délai supplémentaire raisonnable puis, à défaut d'exécution, résoudre le contrat dans les conditions du Code de la consommation. Maison JLA rembourse alors les sommes versées dans les quatorze jours.",
      "Maison JLA reste responsable de la livraison jusqu'à la prise de possession physique, sauf transporteur choisi par le client et non proposé par Maison JLA. Le signalement rapide d'un dommage ou d'une erreur ne limite pas les garanties légales.",
    ],
  },
  {
    title: "7. Droit de rétractation et retours",
    paragraphs: [
      "Le client dispose de quatorze jours à compter du lendemain de la réception pour notifier sa rétractation, sans motif. Il peut utiliser la fonctionnalité Renoncer au contrat ici sur le site, le formulaire type ci-dessous, ou toute déclaration non ambiguë envoyée à Maison JLA.",
      "Après notification, les produits doivent être renvoyés sous quatorze jours à Maison JLA, Julia Touret EI, 5 Rue Joliot-Curie, 80200 Doingt. Les frais directs de retour sont à la charge du client. Une dépréciation résultant de manipulations dépassant celles nécessaires pour établir la nature et les caractéristiques du bien peut engager sa responsabilité.",
      "Maison JLA rembourse les paiements reçus, y compris la livraison standard, dans les quatorze jours suivant la notification. Le remboursement peut être différé jusqu'à la récupération du bien ou la preuve de son expédition. Il est effectué par le même moyen de paiement, sauf accord contraire et sans frais.",
    ],
  },
  {
    title: "8. Garanties légales",
    boxed: true,
    paragraphs: [
      "Le consommateur dispose de deux ans à compter de la délivrance du bien pour mettre en œuvre la garantie légale de conformité. Durant ce délai, il doit établir l'existence du défaut, et non sa date d'apparition.",
      "Lorsque le contrat de vente du bien prévoit la fourniture d'un contenu numérique ou d'un service numérique de manière continue pendant une durée supérieure à deux ans, la garantie légale est applicable à ce contenu numérique ou ce service numérique tout au long de la période de fourniture prévue. Durant ce délai, le consommateur n'est tenu d'établir que l'existence du défaut de conformité affectant le contenu numérique ou le service numérique et non la date d'apparition de celui-ci.",
      "La garantie légale de conformité emporte obligation pour le professionnel, le cas échéant, de fournir toutes les mises à jour nécessaires au maintien de la conformité du bien.",
      "Cette garantie donne droit à la réparation ou au remplacement dans les trente jours suivant la demande, sans frais ni inconvénient majeur. Une réparation prolonge la garantie initiale de six mois. Si le client demande une réparation mais que le vendeur impose un remplacement, la garantie est renouvelée pour deux ans à compter du remplacement.",
      "Le client peut obtenir une réduction du prix en conservant le bien ou mettre fin au contrat contre restitution si Maison JLA refuse la mise en conformité, si celle-ci dépasse trente jours, occasionne un inconvénient majeur ou si le défaut persiste. La réduction ou la résolution peut être immédiate si le défaut est suffisamment grave, sans demande préalable de réparation ou de remplacement. La résolution n'est pas ouverte pour un défaut mineur.",
      "Toute période d'immobilisation du bien en vue de sa réparation ou de son remplacement suspend la garantie qui restait à courir jusqu'à la délivrance du bien remis en état. Ces droits résultent des articles L. 217-1 à L. 217-32 du Code de la consommation.",
      "Le consommateur bénéficie aussi de la garantie des vices cachés des articles 1641 à 1649 du Code civil pendant deux ans à compter de la découverte du défaut. Elle donne droit à une réduction du prix si le bien est conservé ou à un remboursement intégral contre restitution.",
      "Le vendeur qui fait obstacle de mauvaise foi à la garantie légale de conformité encourt une amende civile maximale de 300 000 euros, pouvant être portée à 10 % du chiffre d'affaires moyen annuel.",
      "Pour exercer une garantie, le client contacte Maison JLA aux coordonnées de l'article 1. La mise en conformité est sans frais. Aucune garantie commerciale supplémentaire n'est proposée.",
    ],
  },
  {
    title: "9. Responsabilité et force majeure",
    paragraphs: [
      "Maison JLA répond de la bonne exécution du contrat. Sa responsabilité ne peut être engagée lorsque l'inexécution résulte du fait imprévisible et insurmontable d'un tiers, du fait du client ou d'un événement de force majeure. Aucune clause ne limite les droits impératifs du consommateur.",
    ],
  },
  {
    title: "10. Données personnelles et propriété intellectuelle",
    paragraphs: [
      "Les données nécessaires à la commande, au paiement, à la livraison, au service après-vente et aux obligations comptables sont traitées selon la politique de confidentialité accessible sur le site. Aucun compte ni newsletter n'est proposé.",
      "Les textes, photographies, visuels, logos et éléments graphiques du site sont protégés. Toute reproduction ou exploitation non autorisée est interdite.",
    ],
  },
  {
    title: "11. Preuve et archivage",
    paragraphs: [
      "Les enregistrements électroniques conservés dans des conditions raisonnables de sécurité peuvent servir de preuve. Le client reçoit sa référence, son récapitulatif, sa facture et les CGV par e-mail. Pour une commande d'au moins 120 EUR, Maison JLA conserve le contrat pendant dix ans et en garantit l'accès sur demande.",
    ],
  },
  {
    title: "12. Réclamations, médiation et litiges",
    paragraphs: [
      "Toute réclamation est d'abord adressée à Maison JLA, par e-mail à contact@maisonjla.fr ou par courrier à l'adresse de l'article 1.",
      "Après une réclamation écrite préalable restée sans solution, le client peut recourir gratuitement au Centre de la Médiation de la Consommation de Conciliateurs de Justice CM2C, 49 rue de Ponthieu, 75008 Paris, sur https://www.cm2c.net/declarer-un-litige.php.",
      "Les présentes CGV et les ventes sont soumises au droit français. A défaut d'accord amiable, le client peut saisir la juridiction compétente selon les règles de droit commun, notamment celle de son domicile dans les conditions du Code de la consommation.",
    ],
  },
  {
    title: "Formulaire type de rétractation",
    paragraphs: [
      "A compléter et à envoyer uniquement si vous souhaitez vous rétracter.",
      "A l'attention de Julia Touret EI - Maison JLA, 5 Rue Joliot-Curie, 80200 Doingt, contact@maisonjla.fr.",
      "Je vous notifie ma rétractation du contrat portant sur la vente des biens suivants : ............................................................",
      "Commandé(s) le : ....................   Reçu(s) le : ....................   Numéro de commande : ................................",
      "Nom et adresse du consommateur : ...............................................................................................................",
      "Date : ....................   Signature, uniquement en cas d'envoi sur papier : ................................",
    ],
  },
];

const termsSnapshot = () => ({
  version: TERMS_VERSION,
  sections: TERMS_SECTIONS.map((section) => ({
    title: section.title,
    boxed: Boolean(section.boxed),
    paragraphs: [...section.paragraphs],
  })),
});

const termsHash = () =>
  createHash("sha256").update(JSON.stringify(termsSnapshot())).digest("hex");

function createTermsPdf(snapshot = termsSnapshot()) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      margins: { top: 52, right: 54, bottom: 54, left: 54 },
      info: {
        Title: "Conditions générales de vente Maison JLA",
        Author: "Maison JLA - Julia Touret EI",
        Subject: `Version du ${snapshot.version}`,
      },
    });
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    document.fillColor("#302722").font("Helvetica-Bold").fontSize(23).text("CONDITIONS GENERALES DE VENTE");
    document.moveDown(0.45).font("Helvetica").fontSize(10).fillColor("#776b64").text(`Maison JLA - Version en vigueur au ${snapshot.version}`);
    document.moveDown(1.5).fillColor("#302722").fontSize(10).text("Les présentes conditions encadrent les commandes de bijoux passées par des consommateurs en France métropolitaine. La commande s'effectue sans création de compte.", { lineGap: 3 });

    for (const section of snapshot.sections) {
      document.moveDown(1.15);
      document.fillColor("#302722").font("Helvetica-Bold").fontSize(13).text(section.title, { keepTogether: true });
      document.moveDown(0.45);
      if (section.boxed) {
        document.fillColor("#776b64").font("Helvetica-Oblique").fontSize(8.5).text("Encadré relatif aux garanties légales", { lineGap: 2 });
        document.moveDown(0.35);
      }
      for (const paragraph of section.paragraphs) {
        document.fillColor("#302722").font("Helvetica").fontSize(9.3).text(paragraph, { align: "justify", lineGap: 2.4 });
        document.moveDown(0.55);
      }
    }

    document.end();
  });
}

module.exports = { createTermsPdf, termsSnapshot, termsHash, TERMS_SECTIONS, TERMS_VERSION };
