import Logo from "../extensions/logo-maison-jla.png";

const config = {
  locales: ["fr"],
  auth: { logo: Logo },
  menu: { logo: Logo },
  translations: {
    fr: {
      "Auth.form.welcome.title": "Maison JLA",
      "Auth.form.welcome.subtitle": "Espace d'administration",
      "app.components.LeftMenu.navbrand.title": "Maison JLA",
      "HomePage.header.title": "Bonjour {name} !",
      "HomePage.header.subtitle": "Bienvenue dans l'administration Maison JLA",
      "HomePage.head.title": "Accueil",
      "app.components.HomePage.community": "GESTION DE LA BOUTIQUE",
      "content-manager.plugin.name": "Gestionnaire de contenu",
      "content-type-builder.plugin.name": "Constructeur de types",
    },
  },
  theme: {
    light: {
      colors: {
        /* Couleurs principales du site */
        primary100: "#f4eee8",
        primary200: "#e6d8cc",
        primary500: "#8b6f5a",
        primary600: "#765b49",
        primary700: "#604838",

        /* Couleur secondaire */
        secondary100: "#faf7f3",
        secondary200: "#eee5dd",
        secondary500: "#b99b83",
        secondary600: "#a1846d",
        secondary700: "#896b56",

        /* Neutres */
        neutral0: "#ffffff",
        neutral100: "#f8f5f2",
        neutral200: "#eee9e4",
        neutral300: "#ded6cf",
        neutral400: "#b7aaa0",
        neutral500: "#887a70",
        neutral600: "#5f544d",
        neutral700: "#403832",
        neutral800: "#302a26",
        neutral900: "#211d1a",

        buttonPrimary500: "#8b6f5a",
        buttonPrimary600: "#765b49",

        alternative100: "#faf7f3",
        alternative200: "#eee5dd",
        alternative500: "#b99b83",
        alternative600: "#a1846d",
        alternative700: "#896b56",

        danger500: "#c0392b",
        danger600: "#a93226",
      },
    },
  },
};

const bootstrap = () => {
  const applyStyles = () => {
    const nav = document.querySelector("nav");

    if (!nav) return false;

    const navClasses = Array.from(nav.classList).join(".");

    const style = document.createElement("style");

    style.id = "les-photos-de-cecile-custom-css";

    style.textContent = `
      /* ═══════════════════════════════════════════════════════
         MENU LATÉRAL
      ═══════════════════════════════════════════════════════ */

      nav.${navClasses},
      nav.${navClasses} > div,
      nav.${navClasses} > div > div,
      nav.${navClasses} > div > div > div {
        background-color: #8b6f5a !important;
      }


      /* ═══════════════════════════════════════════════════════
         LIENS DU MENU
      ═══════════════════════════════════════════════════════ */

      nav.${navClasses} a,
      nav.${navClasses} button,
      nav.${navClasses} li,
      nav.${navClasses} ul,
      nav.${navClasses} ul > li,
      nav.${navClasses} ul > li > a,
      nav.${navClasses} ul > li > button {
        background-color: transparent !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        color: #ffffff !important;
      }


      /* ═══════════════════════════════════════════════════════
         ICÔNES
      ═══════════════════════════════════════════════════════ */

      nav.${navClasses} svg,
      nav.${navClasses} svg * {
        color: #ffffff !important;
        fill: none !important;
        stroke: currentColor !important;
      }


      /* ═══════════════════════════════════════════════════════
         ITEM ACTIF
      ═══════════════════════════════════════════════════════ */

      nav.${navClasses} a[aria-current="page"] {
        background-color: #765b49 !important;
        border-radius: 8px !important;
      }

      nav.${navClasses} a[aria-current="page"] svg,
      nav.${navClasses} a[aria-current="page"] svg * {
        color: #ffffff !important;
        stroke: currentColor !important;
      }


      /* ═══════════════════════════════════════════════════════
         HOVER
      ═══════════════════════════════════════════════════════ */

      nav.${navClasses} a:hover,
      nav.${navClasses} button:hover {
        background-color: #765b49 !important;
        border-radius: 8px !important;
      }


      /* ═══════════════════════════════════════════════════════
         SÉPARATEURS
      ═══════════════════════════════════════════════════════ */

      nav.${navClasses} [role="separator"] {
        background-color: #765b49 !important;
      }


      /* ═══════════════════════════════════════════════════════
         AVATAR / PROFIL
      ═══════════════════════════════════════════════════════ */

      nav.${navClasses} > div:last-child,
      nav.${navClasses} > div:last-child * {
        background-color: #8b6f5a !important;
        border-top: 1px solid #765b49 !important;
        color: #ffffff !important;
      }


      /* ═══════════════════════════════════════════════════════
         BADGES
      ═══════════════════════════════════════════════════════ */

      nav.${navClasses} span[class],
      nav.${navClasses} [aria-label*="notif"] {
        background-color: #b99b83 !important;
        border-color: #8b6f5a !important;
        color: #ffffff !important;
      }


      /* ═══════════════════════════════════════════════════════
         MASQUER MARKETPLACE
      ═══════════════════════════════════════════════════════ */

      nav a[href*="/marketplace"],
      nav a[href*="marketplace"] {
        display: none !important;
      }


      /* ═══════════════════════════════════════════════════════
         MASQUER DÉPLOYER / DEPLOY / CLOUD
      ═══════════════════════════════════════════════════════ */

      nav a[href*="/deploy"],
      nav a[href*="deploy"],
      nav a[href*="/plugins/deployment"],
      nav a[href*="cloud"] {
        display: none !important;
      }


      /* ═══════════════════════════════════════════════════════
         BORDURES GÉNÉRALES
      ═══════════════════════════════════════════════════════ */

      hr,
      [role="separator"] {
        background-color: #eee9e4 !important;
        border-color: #eee9e4 !important;
      }


      /* ═══════════════════════════════════════════════════════
         BOUTONS PRINCIPAUX
      ═══════════════════════════════════════════════════════ */

      button[data-state],
      button[type="submit"] {
        border-radius: 6px !important;
      }
    `;

    if (!document.getElementById("les-photos-de-cecile-custom-css")) {
      document.head.appendChild(style);
    }

    return true;
  };

  if (!applyStyles()) {
    const observer = new MutationObserver(() => {
      if (applyStyles()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
};

export default { config, bootstrap };
