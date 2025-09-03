import { initializeWallet } from './wallet.js'
import { createNode } from './p2p.js'
import {
  createPaymentPayload,
  verifyTransaction,
  signTransaction,
  createSetRateRatioPayload,
  createVectorPayload,
  createSetDailyBonusPayload,
  updateRates,
  createAskValidationAccountPayload,
  createAccountValidationPayload,
  createPollQuestionPayload,
  createPollAnswerPayload,
  createInformationPayload
} from './transaction.js'
import { VECTORS } from './vectors.js';
import { formatTransactionForFrontend } from './api.js'
import { multiaddr } from '@multiformats/multiaddr'
import { peerIdFromString } from '@libp2p/peer-id'
import readline from 'readline'
import clipboardy from 'clipboardy'
import { config, logger } from './config.js'
import path from 'path'
import { mkdir } from 'fs/promises'
import { json } from '@helia/json'

// Configuration des arguments de ligne de commande
const peerAddress = process.argv[3]

// Configuration de readline pour l'entrée utilisateur
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

// Topic GossipSub pour le registre global
const GLOBAL_LEDGER_TOPIC = '/invectis/global-ledger/1.0'

async function main() {
  // Garde une trace des "têtes" du DAG (transactions sans enfants)
  let dagHeads = []

  try {
    logger.prod(`Lancement en mode: ${config.appMode}`)

    // Création du répertoire de données et définition du chemin du portefeuille
    const dataDir = 'data'
    await mkdir(dataDir, { recursive: true })
    const walletFile = path.join(dataDir, process.argv[2] || 'wallet.dat')

    // Initialisation du portefeuille
    logger.info('Initialisation du portefeuille...')
    const wallet = await initializeWallet(walletFile, rl)

    // Initialisation du nœud P2P
    logger.info('Initialisation du nœud P2P...')
    const node = await createNode(wallet.privateKey)
    const j = json(node)

    // Augmenter l'objet wallet avec les informations dérivées du noeud
    wallet.peerId = node.libp2p.peerId
    wallet.sign = (data) => wallet.privateKey.sign(data)

    logger.info('Identité:', wallet.peerId.toString())
    logger.info('Type de compte:', wallet.accountType)

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
    await node.libp2p.services.pubsub.subscribe(GLOBAL_LEDGER_TOPIC)
    logger.prod(`\n✅ Abonné au topic: ${GLOBAL_LEDGER_TOPIC}`)

    // Gestion des messages entrants
    node.libp2p.services.pubsub.addEventListener('message', async (event) => {
      if (event.detail.topic !== GLOBAL_LEDGER_TOPIC) return

      try {
        logger.debug('Message reçu sur le topic')
        logger.debug('  - Topic:', event.detail.topic)
        logger.debug('  - From:', event.detail.from?.toString())
        logger.debug('  - Data length:', event.detail.data.length)

        // Décodage du message
        const message = JSON.parse(new TextDecoder().decode(event.detail.data))
        logger.debug('  - Message décodé:', message)

        // Vérification de la transaction
        const authorPeerId = peerIdFromString(message.author)
        const isValid = await verifyTransaction(message, authorPeerId)

        if (isValid) {
          const cid = await j.add(message)
          logger.prod(`✅ Transaction valide reçue et stockée dans le DAG local. CID: ${cid.toString()}`)

          // Gère la mise à jour des têtes du DAG
          const parentStrings = message.parents || []
          const remainingHeads = dagHeads.filter(h => !parentStrings.includes(h.toString()))
          dagHeads = [...remainingHeads, cid]
          logger.debug('Nouvelles têtes du DAG:', dagHeads.map(h => h.toString()))

          logger.info(`\n💸 Transaction traitée (type: ${message.type})`)
          logger.info('De:', message.author)
          logger.info('Description:', message.payload.description)
          logger.info('Reference:', message.payload.reference)
          logger.info('Horodatage:', new Date(message.timestamp).toLocaleString())

          switch (message.type) {
            case 'PAYMENT':
              logger.info('Pour:', message.payload.to)
              logger.info('Montant:', message.payload.amount, message.payload.currency)
              break;
            case 'SETRATERATIO':
              logger.info('Nouveaux ratios de conversion:', message.payload.rates)
              await updateRates(message.payload.rates);
              logger.info('Ratios de conversion mis à jour.')
              break;
            case 'VECTOR_TRANSACTION':
              logger.info('Pour:', message.payload.to)
              logger.info('Vecteurs:', message.payload.vectors)
              logger.info('Temps Total:', message.payload.totalTime)
              break;
            case 'SETDAILYBONUS':
              logger.info('Bonus journalier:', message.payload.bonus)
              break;
            case 'ASK_VALIDATION_ACCOUNT':
              logger.info('Demande de validation de compte de:', message.author)
              logger.info('Message:', message.payload.message)
              break;
            case 'ACCOUNT_VALIDATION':
              logger.info('Compte validé par:', message.author)
              logger.info('Validé:', message.payload.validated)
              break;
            case 'POLL_QUESTION':
              logger.info('Sondage reçu de:', message.author)
              logger.info('Question:', message.payload.question)
              logger.info('Type:', message.payload.type)
              logger.info('Options:', message.payload.options)
              break;
            case 'POLL_ANSWER':
              logger.info('Réponse au sondage reçue de:', message.author)
              logger.info('Sondage ID:', message.payload.pollId)
              logger.info('Réponse:', message.payload.answer)
              break;
            case 'INFORMATION':
              logger.info('Information reçue de:', message.author)
              logger.info('Message:', message.payload.message)
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
        rl.question('\n(1: Payment, 2: Vector, 3: SetRates, 4: DailyBonus, 5: AskValidation, 6: ValidateAccount, 7: PollQuestion, 8: PollAnswer, 9: Information, 0: Log Heads)? ', async (choice) => {
          let payload
          let type

          try {
            switch (choice) {
              case '0':
                logger.prod('\n--- Current Ledger Heads ---')
                if (dagHeads.length === 0) {
                  logger.info('Ledger is empty.')
                } else {
                  for (const cid of dagHeads) {
                    try {
                      const transaction = await j.get(cid)
                      const formatted = formatTransactionForFrontend(cid, transaction)

                      logger.info(`\nCID: ${cid.toString()}`)

                      logger.prod('--- Raw Transaction Object ---')
                      console.dir(transaction, { depth: null })

                      logger.prod('\n--- Formatted for Frontend ---')
                      console.dir(formatted, { depth: null })

                    } catch (err) {
                      logger.error(`Could not retrieve transaction for CID ${cid.toString()}:`, err)
                    }
                  }
                }
                logger.prod('----------------------------\n')
                break
              case '1':
                type = 'PAYMENT'
                payload = createPaymentPayload(wallet, recipientPeerId, 'Payment', 'ref-payment-001')
                break
              case '2':
                type = 'VECTOR_TRANSACTION'
                const vectorValues = {}
                for (const vector of VECTORS) {
                  vectorValues[vector[0]] = Math.floor(Math.random() * 10)
                }
                logger.info('Sending random vector values:', vectorValues)
                payload = await createVectorPayload(wallet, recipientPeerId, vectorValues, 'Vector Transaction', 'ref-vector-001')
                break
              case '3':
                type = 'SETRATERATIO'
                const newRates = {}
                for (const vector of VECTORS) {
                  newRates[vector[0]] = Math.random() * 2
                }
                logger.info('Sending random rates:', newRates)
                payload = createSetRateRatioPayload(wallet, newRates, 'Set Rate Ratio', 'ref-rates-001')
                break
              case '4':
                type = 'SETDAILYBONUS'
                const walletBalance = Math.random() * 20
                const dailyTransactionSum = (Math.random() * 20) - 10
                logger.info(`Calculating bonus for balance ${walletBalance} and daily sum ${dailyTransactionSum}`)
                payload = createSetDailyBonusPayload(wallet, walletBalance, dailyTransactionSum, 'Daily Bonus', 'ref-bonus-001')
                break
              case '5':
                type = 'ASK_VALIDATION_ACCOUNT'
                payload = createAskValidationAccountPayload(wallet, recipientPeerId, 'Ask for validation', 'ref-ask-validation-001')
                logger.info('Demande de validation envoyée à:', recipientPeerId.toString())
                break
              case '6':
                type = 'ACCOUNT_VALIDATION'
                payload = createAccountValidationPayload(wallet, recipientPeerId, 'Account validation', 'ref-validation-001')
                logger.info('Validation de compte envoyée à:', recipientPeerId.toString())
                break
              case '7':
                type = 'POLL_QUESTION'
                payload = createPollQuestionPayload(wallet, 'What is your favorite color?', 'radio', ['Red', 'Green', 'Blue'], 'Color Poll', 'ref-poll-q-001')
                logger.info('Sondage envoyé.')
                break
              case '8':
                type = 'POLL_ANSWER'
                const pollId = Date.now() - 10000 // -10sec
                payload = createPollAnswerPayload(wallet, pollId, 'Blue', 'Color Poll Answer', 'ref-poll-a-001')
                logger.info('Réponse au sondage envoyée.')
                break
              case '9':
                type = 'INFORMATION'
                payload = createInformationPayload(wallet, 'This is a broadcast information message.', 'Information', 'ref-info-001')
                logger.info('Information envoyée.')
                break
              default:
                logger.warn('Choix invalide.')
                askForTransaction()
                return
            }

            if (payload) {
              // Construire le noeud du DAG
              const transactionToSign = {
                parents: dagHeads.map(cid => cid.toString()), // Convert CIDs to strings for signing
                author: wallet.peerId.toString(),
                timestamp: Date.now(),
                type,
                payload
              }

              const signedTransaction = await signTransaction(transactionToSign, wallet.sign)

              // Stocke la transaction dans le blockstore local pour obtenir un CID
              const cid = await j.add(signedTransaction)
              logger.prod(`✅ Transaction créée et stockée localement. CID: ${cid.toString()}`)

              // Met à jour la tête du DAG
              const parentStrings = signedTransaction.parents || []
              const remainingHeads = dagHeads.filter(h => !parentStrings.includes(h.toString()))
              dagHeads = [...remainingHeads, cid]
              logger.debug('Nouvelles têtes du DAG:', dagHeads.map(h => h.toString()))

              const messageBytes = new TextEncoder().encode(JSON.stringify(signedTransaction))
              await node.libp2p.services.pubsub.publish(GLOBAL_LEDGER_TOPIC, messageBytes)
              logger.info('✅ Transaction publiée sur le réseau!')
            }
          } catch (error) {
            logger.error('Erreur d\'envoi:', error.message)
            logger.debug('Stack trace:', error)
          }
          askForTransaction()
        })
      }
      askForTransaction();
    } else {
      // Debug: Only log peer list on the listening node to avoid prompt interference
      setTimeout(async () => {
        const peers = node.libp2p.services.pubsub.getSubscribers(GLOBAL_LEDGER_TOPIC)
        logger.debug(`Peers abonnés au topic ${GLOBAL_LEDGER_TOPIC}:`, peers.map(p => p.toString()))
      }, 3000)
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
