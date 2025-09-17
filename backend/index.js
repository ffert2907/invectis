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
} from './transaction.js';
import { VECTORS } from './vectors.js';
import { formatTransactionForFrontend } from './api.js'
import { multiaddr } from '@multiformats/multiaddr'
import { peerIdFromString } from '@libp2p/peer-id'
import readline from 'readline'
import clipboardy from 'clipboardy'
import { logger } from './config.js'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdir } from 'fs/promises'
import { startNode, appContext, applyAutomaticBonus } from './core.js'
import { calculateBalance, getNonce, calculateDailyTransactionSum } from './ledger.js'

const peerAddress = process.argv[3]
const customDataDir = process.argv[4]

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const GLOBAL_LEDGER_TOPIC = '/invectis/global-ledger/1.0'

async function main() {
  try {
    logger.prod('Starting in Console Mode...')

    const dataDir = path.join(__dirname, 'data')
    await mkdir(dataDir, { recursive: true })
    const walletFileName = process.argv[2] || 'wallet.dat'
    const walletFile = path.join(dataDir, walletFileName)

    const wallet = await initializeWallet(walletFile, rl)

    const datastorePath = customDataDir
      ? path.join(dataDir, customDataDir)
      : path.join(dataDir, `helia_${path.basename(walletFileName, '.dat')}`)
    logger.prod(`Using datastore: ${datastorePath}`)

    const datastoreConfig = {
      type: 'leveldb',
      path: datastorePath
    };

    await startNode(wallet, datastoreConfig)

    const addresses = appContext.node.libp2p.getMultiaddrs()
    logger.prod('\nListening addresses:')
    addresses.forEach(addr => logger.prod(addr.toString()))

     if (!peerAddress) {
      try {
        const wsAddress = addresses.find(addr => addr.toString().includes('/ws'))
        if (wsAddress) {
          await clipboardy.write(wsAddress.toString())
          logger.prod('\n✅ Adresse WebSocket copiée dans le presse-papiers!')
        }
      } catch (error) {
        logger.warn('Could not copy to clipboard:', error.message)
      }
    }

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
              case '1':
                {
                  type = 'PAYMENT';
                  logger.info('--- Create a new Payment ---');

                  // Apply automatic bonus if eligible
                  await applyAutomaticBonus();

                  // Proceed with payment
                  const balance = await calculateBalance(appContext.wallet.peerId.toString(), appContext.ledgerManager);

                  logger.info(`Your current account balance is: ${balance}`);
                  if (balance <= 0) {
                    logger.warn('You have no funds to send.');
                    askForTransaction();
                    return;
                  }

                  logger.info('Please enter the amount you would like to send.');
                  rl.question(`Enter amount to send (max ${balance}): `, async (amountStr) => {
                    const amount = parseFloat(amountStr);
                    if (isNaN(amount) || amount <= 0 || amount > balance) {
                      logger.error('Invalid amount.');
                      askForTransaction();
                      return;
                    }

                    try {
                      const nonce = await getNonce(appContext.wallet.peerId.toString(), appContext.ledgerManager);
                      const paymentPayload = createPaymentPayload(appContext.wallet, recipientPeerId, amount, nonce, 'Payment', `ref-payment-${nonce}`);

                      const paymentTransactionToSign = {
                        parents: appContext.ledgerManager.getHeads().map(cid => cid.toString()),
                        author: appContext.wallet.peerId.toString(),
                        timestamp: Date.now(),
                        type,
                        payload: paymentPayload
                      };
                      const signedPaymentTransaction = await signTransaction(paymentTransactionToSign, appContext.wallet.sign);
                      const paymentCid = await appContext.ledgerManager.addTransaction(signedPaymentTransaction);
                      appContext.dagHeads = appContext.ledgerManager.getHeads();
                      const paymentMessageBytes = new TextEncoder().encode(JSON.stringify(signedPaymentTransaction));
                      await appContext.node.libp2p.services.pubsub.publish(GLOBAL_LEDGER_TOPIC, paymentMessageBytes);
                      logger.info('✅ Payment transaction published to the network!');
                    } catch (e) {
                      logger.error('Error creating payment:', e);
                    } finally {
                      askForTransaction();
                    }
                  });
                  return;
                }
              case '2':
                {
                  type = 'VECTOR_TRANSACTION'
                  const vectorValues = {}
                  for (const vector of VECTORS) {
                    vectorValues[vector[0]] = Math.floor(Math.random() * 10)
                  }
                  const nonce = await getNonce(appContext.wallet.peerId.toString(), appContext.ledgerManager)
                  payload = await createVectorPayload(appContext.wallet, recipientPeerId, vectorValues, nonce, 'Vector Transaction', `ref-vector-${nonce}`)
                  break
                }
              case '3':
                 type = 'SETRATERATIO'
                 const newRates = {}
                 for (const vector of VECTORS) {
                   newRates[vector[0]] = Math.random() * 2
                 }
                 payload = createSetRateRatioPayload(appContext.wallet, newRates, 'Set Rate Ratio', 'ref-rates-001')
                 break
              case '4':
                {
                  type = 'SETDAILYBONUS';
                  const walletBalance = await calculateBalance(appContext.wallet.peerId.toString(), appContext.ledgerManager);
                  const dailyTransactionSum = await calculateDailyTransactionSum(appContext.wallet.peerId.toString(), appContext.ledgerManager);

                  logger.info(`Current balance for bonus calculation: ${walletBalance}`);
                  logger.info(`Today's transaction sum for bonus calculation: ${dailyTransactionSum}`);

                  payload = createSetDailyBonusPayload(appContext.wallet, walletBalance, dailyTransactionSum, 'Daily Bonus', 'ref-bonus-001');

                  if (payload && payload.bonus > 0) {
                    logger.info(`✅ Daily bonus of ${payload.bonus} will be added.`);
                  } else {
                    logger.info('No daily bonus will be added at this time.');
                  }
                  break;
                }
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
              const transactionToSign = {
                parents: appContext.ledgerManager.getHeads().map(cid => cid.toString()),
                author: appContext.wallet.peerId.toString(),
                timestamp: Date.now(),
                type,
                payload
              }

              const signedTransaction = await signTransaction(transactionToSign, appContext.wallet.sign)
              const cid = await appContext.ledgerManager.addTransaction(signedTransaction);
              appContext.dagHeads = appContext.ledgerManager.getHeads();

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

main();
