import Logo from '../extensions/logo-maison-jla.png'

const config = {
  locales: ['fr'],
  auth: { logo: Logo },
  menu: { logo: Logo },
  translations: {
    fr: {
      'Auth.form.welcome.title': 'Maison JLA',
      'Auth.form.welcome.subtitle': "Espace d'administration",
      'app.components.LeftMenu.navbrand.title': 'Maison JLA',
      'HomePage.header.title': 'Bonjour {name} !',
      'HomePage.header.subtitle': "Bienvenue dans l'administration Maison JLA",
      'HomePage.head.title': 'Accueil',
      'app.components.HomePage.community': 'GESTION DE LA BOUTIQUE',
      'content-manager.plugin.name': 'Gestionnaire de contenu',
      'content-type-builder.plugin.name': 'Constructeur de types',
    },
  },
  theme: {
    light: {
      colors: {
        primary100: '#f6e7e6', primary200: '#e9ddd3', primary500: '#9b712d', primary600: '#7d5b24', primary700: '#60451b',
        secondary100: '#fffaf6', secondary200: '#f5eee6', secondary500: '#b58132', secondary600: '#946624', secondary700: '#72501c',
        neutral0: '#ffffff', neutral100: '#fffaf6', neutral200: '#f5eee6', neutral300: '#e9ddd3', neutral400: '#b6a8a0',
        neutral500: '#887971', neutral600: '#776b64', neutral700: '#514640', neutral800: '#302722', neutral900: '#211a17',
        buttonPrimary500: '#302722', buttonPrimary600: '#1f1916',
        alternative100: '#f6e7e6', alternative200: '#e9ddd3', alternative500: '#b58132', alternative600: '#946624', alternative700: '#72501c',
      },
    },
  },
}

const bootstrap = () => {
  const applyStyles = () => {
    const navigation = document.querySelector('nav')
    if (!navigation || document.getElementById('maison-jla-admin-styles')) return Boolean(navigation)

    const style = document.createElement('style')
    style.id = 'maison-jla-admin-styles'
    style.textContent = `
      nav, nav > div, nav > div > div { background-color: #302722 !important; }
      nav a, nav button, nav li, nav svg, nav svg * { color: #fffaf6 !important; }
      nav a[aria-current="page"], nav a:hover, nav button:hover { background-color: #60451b !important; border-radius: 8px !important; }
      nav [role="separator"] { background-color: #60451b !important; }
      nav a[href*="marketplace"], nav a[href*="deploy"], nav a[href*="cloud"] { display: none !important; }
    `
    document.head.appendChild(style)
    return true
  }

  if (applyStyles()) return
  const observer = new MutationObserver(() => {
    if (applyStyles()) observer.disconnect()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

export default { config, bootstrap }
