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
    const navigation = document.querySelector("nav");
    if (!navigation || document.getElementById("maison-jla-admin-styles"))
      return Boolean(navigation);

    const style = document.createElement("style");
    style.id = "maison-jla-admin-styles";
    style.textContent = `
      nav, nav > div, nav > div > div { background-color: #302722 !important; }
      nav a, nav button, nav li, nav svg, nav svg * { color: #fffaf6 !important; }
      nav a[aria-current="page"], nav a:hover, nav button:hover { background-color: #60451b !important; border-radius: 8px !important; }
      nav [role="separator"] { background-color: #60451b !important; }
      nav a[href*="marketplace"], nav a[href*="deploy"], nav a[href*="cloud"] { display: none !important; }
    `;
    document.head.appendChild(style);
    return true;
  };

  if (applyStyles()) return;
  const observer = new MutationObserver(() => {
    if (applyStyles()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
};

export default { config, bootstrap };
