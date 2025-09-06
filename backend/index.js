import { initializeWallet } from './wallet.js'
import {
  createPaymentPayload,
  signTransaction,
  createSetRateRatioPayload,
  createVectorPayload,
  createSetDailyBonusPayload,
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
import { fileURLToPath } from 'url'
import { mkdir } from 'fs/promises'
import { startNode, appContext } from './core.js' // <-- Import from core

// Configuration des arguments de ligne de commande
const peerAddress = process.argv[3]
const customDataDir = process.argv[4] // Argument optionnel pour le répertoire de données

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configuration de readline pour l'entrée utilisateur
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

// Topic GossipSub pour le registre global (needed for publishing)
const GLOBAL_LEDGER_TOPIC = '/invectis/global-ledger/1.0'

async function main() {
  try {
    logger.prod('Starting in Console Mode...')

    // Création du répertoire de données et définition du chemin du portefeuille
    const dataDir = path.join(__dirname, 'data')
    await mkdir(dataDir, { recursive: true })
    const walletFileName = process.argv[2] || 'wallet.dat'
    const walletFile = path.join(dataDir, walletFileName)

    // Initialisation du portefeuille (interactive)
    const wallet = await initializeWallet(walletFile, rl)

    // Détermine le chemin du datastore
    const datastorePath = customDataDir
      ? path.join(dataDir, customDataDir)
      : path.join(dataDir, `helia_${path.basename(walletFileName, '.dat')}`) // Derive from wallet name
    logger.prod(`Using datastore: ${datastorePath}`)

    // Start the core P2P node
    await startNode(wallet, datastorePath)

    // Affichage des adresses d'écoute from appContext
    const addresses = appContext.node.libp2p.getMultiaddrs()
    logger.prod('\nListening addresses:')
    addresses.forEach(addr => logger.prod(addr.toString()))

    // Copie automatique de l'adresse WebSocket dans le presse-papiers
    if (!peerAddress) {
      try {
        const wsAddress = addresses.find(addr => addr.toString().includes('/ws'))
        if (wsAddress) {
          await clipboardy.write(wsAddress.toString())
          logger.prod('\n✅ WebSocket Address copied to clipboard!')
        }
      } catch (error) {
        logger.warn('Could not copy to clipboard:', error.message)
      }
    }

    // Connexion manuelle à un pair si une adresse est fournie
    if (peerAddress) {
      try {
        logger.info(`\nConnecting to ${peerAddress}...`)
        const ma = multiaddr(peerAddress)
        await appContext.node.libp2p.dial(ma)
        logger.prod('✅ Successfully connected to peer.')
      } catch (error) {
        logger.error('Connection error:', error.message)
        logger.info('Node will continue to run in listening mode.')
      }
    }

    // The message listener is now in core.js. We just need to handle user input.

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
                if (appContext.dagHeads.length === 0) {
                  logger.info('Ledger is empty.')
                } else {
                  for (const cid of appContext.dagHeads) {
                    try {
                      const transaction = await appContext.j.get(cid)
                      const formatted = formatTransactionForFrontend(cid, transaction)
                      logger.info(`\nCID: ${cid.toString()}`)
                      logger.prod('--- Formatted for Frontend ---')
                      console.dir(formatted, { depth: null })
                    } catch (err) {
                      logger.error(`Could not retrieve transaction for CID ${cid.toString()}:`, err)
                    }
                  }
                }
                logger.prod('----------------------------\n')
                break
              // Cases 1-9 for creating transactions...
              case '1':
                type = 'PAYMENT'
                payload = createPaymentPayload(appContext.wallet, recipientPeerId, 'Payment', 'ref-payment-001')
                break
              case '2':
                type = 'VECTOR_TRANSACTION'
                const vectorValues = {}
                for (const vector of VECTORS) {
                  vectorValues[vector[0]] = Math.floor(Math.random() * 10)
                }
                payload = await createVectorPayload(appContext.wallet, recipientPeerId, vectorValues, 'Vector Transaction', 'ref-vector-001')
                break
              case '3':
                 type = 'SETRATERATIO'
                 const newRates = {}
                 for (const vector of VECTORS) {
                   newRates[vector[0]] = Math.random() * 2
                 }
                 payload = createSetRateRatioPayload(appContext.wallet, newRates, 'Set Rate Ratio', 'ref-rates-001')
                 break
              case '4':
                 type = 'SETDAILYBONUS'
                 const walletBalance = Math.random() * 20
                 const dailyTransactionSum = (Math.random() * 20) - 10
                 payload = createSetDailyBonusPayload(appContext.wallet, walletBalance, dailyTransactionSum, 'Daily Bonus', 'ref-bonus-001')
                 break
              case '5':
                 type = 'ASK_VALIDATION_ACCOUNT'
                 payload = createAskValidationAccountPayload(appContext.wallet, recipientPeerId, 'Ask for validation', 'ref-ask-validation-001')
                 break
              case '6':
                  type = 'ACCOUNT_VALIDATION'
                  payload = createAccountValidationPayload(appContext.wallet, recipientPeerId, 'Account validation', 'ref-validation-001')
                  break
              case '7':
                  type = 'POLL_QUESTION'
                  payload = createPollQuestionPayload(appContext.wallet, 'What is your favorite color?', 'radio', ['Red', 'Green', 'Blue'], 'Color Poll', 'ref-poll-q-001')
                  break
              case '8':
                  type = 'POLL_ANSWER'
                  const pollId = Date.now() - 10000;
                  payload = createPollAnswerPayload(appContext.wallet, pollId, 'Blue', 'Color Poll Answer', 'ref-poll-a-001')
                  break
              case '9':
                  type = 'INFORMATION'
                  payload = createInformationPayload(appContext.wallet, 'This is a broadcast information message.', 'Information', 'ref-info-001')
                  break
              default:
                logger.warn('Invalid choice.')
                askForTransaction()
                return
            }

            if (payload) {
              // Build, sign, and publish
              const transactionToSign = {
                parents: appContext.dagHeads.map(cid => cid.toString()),
                author: appContext.wallet.peerId.toString(),
                timestamp: Date.now(),
                type,
                payload
              }

              const signedTransaction = await signTransaction(transactionToSign, appContext.wallet.sign)
              const cid = await appContext.j.add(signedTransaction)

              // Optimistically update DAG heads in the shared context
              const parentStrings = signedTransaction.parents || []
              const remainingHeads = appContext.dagHeads.filter(h => !parentStrings.includes(h.toString()))
              appContext.dagHeads = [...remainingHeads, cid]

              const messageBytes = new TextEncoder().encode(JSON.stringify(signedTransaction))
              await appContext.node.libp2p.services.pubsub.publish(GLOBAL_LEDGER_TOPIC, messageBytes)
              logger.info('✅ Transaction published to the network!')
            }
          } catch (error) {
            logger.error('Error sending transaction:', error.message)
          }
          askForTransaction()
        })
      }
      askForTransaction();
    }

    // Gestion de la fermeture propre
    process.on('SIGINT', async () => {
      logger.info('\nShutting down node...')
      rl.close()
      if (appContext.node) {
        await appContext.node.stop()
      }
      process.exit(0)
    })

  } catch (error) {
    logger.error('Fatal Error:', error)
    process.exit(1)
  }
}

// Lancement de l'application
main()
