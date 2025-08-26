import dotenv from 'dotenv'

// Charge les variables d'environnement du fichier .env
dotenv.config()

const config = {
  appMode: process.env.APP_MODE || 'production', // 'production' ou 'debug'
  logs: process.env.LOGS === 'on', // true si 'on', sinon false
  logMode: process.env.LOG_MODE || 'simple' // 'simple' ou 'verbose'
}

// Création d'un logger simple
const logger = {
  info: (...args) => {
    if (config.logs) {
      console.log(...args)
    }
  },
  debug: (...args) => {
    if (config.logs && config.logMode === 'verbose') {
      // Ajoute une couleur pour distinguer les logs de debug
      console.log('\x1b[34m🔍 DEBUG:\x1b[0m', ...args)
    }
  },
  error: (...args) => {
    if (config.logs) {
      // Ajoute une couleur pour distinguer les erreurs
      console.error('\x1b[31m❌ ERREUR:\x1b[0m', ...args)
    }
  },
  warn: (...args) => {
    if (config.logs) {
      // Ajoute une couleur pour distinguer les avertissements
      console.warn('\x1b[33m⚠️ ALERTE:\x1b[0m', ...args)
    }
  }
}

export { config, logger }
