import { initializeWallet } from './wallet.js'
import { createNode } from './p2p.js'
import {
  createPaymentTransaction,
  verifyTransaction,
  signTransaction,
  createSetRateRatioTransaction,
  createVectorTransaction,
  createSetDailyBonusTransaction,
  updateRates
} from './transaction.js'
import { VECTORS } from './vectors.js';
import { multiaddr } from '@multiformats/multiaddr'
import { peerIdFromString } from '@libp2p/peer-id'
import readline from 'readline'
import clipboardy from 'clipboardy'
import { config, logger } from './config.js'

// Configuration des arguments de ligne de commande
const walletFile = process.argv[2] || 'wallet.dat'
const peerAddress = process.argv[3]

// Configuration de readline pour l'entrée utilisateur
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

// Topic GossipSub pour les transactions
const TOPIC = '/invectis/transactions/1.0'

async function main() {
  try {
    logger.prod(`Lancement en mode: ${config.appMode}`)

    // Initialisation du portefeuille
    logger.info('Initialisation du portefeuille...')
    const wallet = await initializeWallet(walletFile)
    logger.info('Identité:', wallet.peerId.toString())

    // Initialisation du nœud P2P
    logger.info('Initialisation du nœud P2P...')
    const node = await createNode(wallet.peerId)

    // Démarrage du nœud
    await node.start()
    logger.prod('Nœud démarré avec succès')

    // Debug: Affichage des protocoles supportés
    logger.debug('Protocoles supportés par ce nœud:')
    const protocols = await node.libp2p.handle([])
    logger.debug('Protocols handled:', Array.from(node.libp2p.getProtocols()))

    // Affichage des adresses d'écoute
    const addresses = node.libp2p.getMultiaddrs()
    logger.prod('\nAdresses d\'écoute:')
    addresses.forEach(addr => logger.prod(addr.toString()))

    // Copie automatique de l'adresse WebSocket dans le presse-papiers
    if (!peerAddress) {
      try {
        const wsAddress = addresses.find(addr => addr.toString().includes('/ws'))
        if (wsAddress) {
          await clipboardy.write(wsAddress.toString())
          logger.prod('\n✅ Adresse WebSocket copiée dans le presse-papiers!')
          logger.info('Utilisez Ctrl+V pour la coller dans le deuxième terminal.')
        }
      } catch (error) {
        logger.warn('Impossible de copier dans le presse-papiers:', error.message)
      }
    }

    // Connexion manuelle à un pair si une adresse est fournie
    if (peerAddress) {
      try {
        logger.info(`\nConnexion à ${peerAddress}...`)

        // Debug: Analyse de l'adresse multiaddr
        logger.debug('Analyse de l\'adresse:')
        const ma = multiaddr(peerAddress)
        logger.debug('  - Adresse multiaddr parsée:', ma.toString())
        logger.debug('  - Protocoles dans l\'adresse:', ma.protoNames())
        logger.debug('  - PeerId extrait:', ma.getPeerId())

        // Vérification que le peer existe encore
        logger.debug('Tentative de connexion...')
        const connection = await node.libp2p.dial(ma)
        logger.prod('✅ Connecté avec succès')
        logger.debug('Détails de la connexion:')
        logger.debug('  - Remote peer:', connection.remotePeer.toString())
        logger.debug('  - Remote addr:', connection.remoteAddr.toString())
        logger.debug('  - Status:', connection.status)

      } catch (error) {
        logger.error('Erreur de connexion:', error.message)
        logger.debug('Stack trace complet:', error)

        // Analyse plus poussée de l'erreur
        if (error.message.includes('At least one protocol must be specified')) {
          logger.debug('Analyse de l\'erreur "protocol must be specified":')
          logger.debug('  - Cette erreur peut venir de:')
          logger.debug('    1. Incompatibilité des transports (TCP vs WebSocket)')
          logger.debug('    2. Protocoles de chiffrement non compatibles')
          logger.debug('    3. Nœud destinataire non accessible')

          // Essai avec une adresse TCP si on a une adresse WS
          if (peerAddress.includes('/ws')) {
            const tcpAddress = peerAddress.replace('/ws', '')
            logger.debug(`Tentative avec adresse TCP: ${tcpAddress}`)
            try {
              const tcpMa = multiaddr(tcpAddress)
              const tcpConnection = await node.libp2p.dial(tcpMa)
              logger.info('✅ Connexion TCP réussie!')
              logger.debug('La connexion WebSocket était le problème')
            } catch (tcpError) {
              logger.error('Connexion TCP également échouée:', tcpError.message)
            }
          }
        }

        logger.info('Le nœud continuera à fonctionner en mode écoute')
      }
    }

    // Attendre un peu pour que la connexion soit établie
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Debug: Vérifier les connexions actives
    logger.debug('État des connexions:')
    const connections = node.libp2p.getConnections()
    logger.debug(`  - Nombre de connexions actives: ${connections.length}`)
    connections.forEach((conn, index) => {
      logger.debug(`  - Connexion ${index + 1}:`)
      logger.debug(`    * Peer: ${conn.remotePeer.toString()}`)
      logger.debug(`    * Adresse: ${conn.remoteAddr.toString()}`)
      logger.debug(`    * Status: ${conn.status}`)
    })

    // Abonnement au topic GossipSub
    await node.libp2p.services.pubsub.subscribe(TOPIC)
    logger.prod(`\n✅ Abonné au topic: ${TOPIC}`)

    // Debug: Vérifier les peers du topic
    setTimeout(async () => {
      const peers = node.libp2p.services.pubsub.getSubscribers(TOPIC)
      logger.debug(`Peers abonnés au topic ${TOPIC}:`, peers.map(p => p.toString()))
    }, 3000)

    // Gestion des messages entrants
    node.libp2p.services.pubsub.addEventListener('message', async (event) => {
      if (event.detail.topic !== TOPIC) return

      try {
        logger.debug('Message reçu sur le topic')
        logger.debug('  - Topic:', event.detail.topic)
        logger.debug('  - From:', event.detail.from?.toString())
        logger.debug('  - Data length:', event.detail.data.length)

        // Décodage du message
        const message = JSON.parse(new TextDecoder().decode(event.detail.data))
        logger.debug('  - Message décodé:', message)

        // Vérification de la transaction
        const authorPeerId = peerIdFromString(message.from)
        const isValid = await verifyTransaction(message, authorPeerId)

        if (isValid) {
          logger.info(`\n💸 Transaction reçue et valide (type: ${message.type})`)
          logger.info('De:', message.from)
          logger.info('Horodatage:', new Date(message.timestamp).toLocaleString())

          switch (message.type) {
            case 'PAYMENT':
              logger.info('Pour:', message.to)
              logger.info('Montant:', message.payload.amount, message.payload.currency)
              break;
            case 'SETRATERATIO':
              logger.info('Nouveaux ratios de conversion:', message.payload.rates)
              await updateRates(message.payload.rates);
              logger.info('Ratios de conversion mis à jour.')
              break;
            case 'VECTOR_TRANSACTION':
              logger.info('Pour:', message.to)
              logger.info('Vecteurs:', message.payload.vectors)
              logger.info('Temps Total:', message.payload.totalTime)
              break;
            case 'SETDAILYBONUS':
              logger.info('Bonus journalier:', message.payload.bonus)
              break;
            default:
              logger.warn('Type de transaction inconnu:', message.type)
          }
        } else {
          logger.warn('Transaction reçue mais invalide!')
        }
      } catch (error) {
        logger.error('Erreur de traitement du message:', error)
      }
    })

    // Gestion de l'entrée utilisateur pour envoyer des transactions
    if (peerAddress) {
      const ma = multiaddr(peerAddress)
      const recipientPeerId = peerIdFromString(ma.getPeerId())

      const askForTransaction = () => {
        rl.question('\nType de transaction (1: Payment, 2: Vector, 3: SetRates, 4: DailyBonus)? ', async (choice) => {
          let transaction;
          try {
            switch (choice) {
              case '1':
                transaction = createPaymentTransaction(wallet.peerId, recipientPeerId);
                break;
              case '2':
                const vectorValues = {};
                for(const vector of VECTORS) {
                    vectorValues[vector[0]] = Math.floor(Math.random() * 10);
                }
                logger.info("Sending random vector values:", vectorValues);
                transaction = await createVectorTransaction(wallet.peerId, recipientPeerId, vectorValues);
                break;
              case '3':
                const newRates = {};
                for(const vector of VECTORS) {
                    newRates[vector[0]] = Math.random() * 2;
                }
                logger.info("Sending random rates:", newRates);
                transaction = createSetRateRatioTransaction(wallet.peerId, newRates);
                break;
              case '4':
                const walletBalance = Math.random() * 20;
                const dailyTransactionSum = (Math.random() * 20) - 10;
                logger.info(`Calculating bonus for balance ${walletBalance} and daily sum ${dailyTransactionSum}`);
                transaction = createSetDailyBonusTransaction(wallet.peerId, walletBalance, dailyTransactionSum);
                break;
              default:
                logger.warn('Choix invalide.');
                askForTransaction();
                return;
            }

            if (transaction) {
              const signedTransaction = await signTransaction(transaction, wallet.sign);
              const messageBytes = new TextEncoder().encode(JSON.stringify(signedTransaction));
              await node.libp2p.services.pubsub.publish(TOPIC, messageBytes);
              logger.info('✅ Transaction envoyée!');
            }
          } catch (error) {
            logger.error('Erreur d\'envoi:', error.message);
            logger.debug('Stack trace:', error);
          }
          askForTransaction();
        });
      };
      askForTransaction();
    }

    // Gestion de la fermeture propre
    process.on('SIGINT', async () => {
      logger.info('\nFermeture du nœud...')
      rl.close()
      await node.stop()
      process.exit(0)
    })

  } catch (error) {
    logger.error('Erreur:', error)
    logger.debug('Stack trace complet:', error)
    process.exit(1)
  }
}

// Lancement de l'application
main()
