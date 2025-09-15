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
import { CID } from 'multiformats/cid'
import readline from 'readline'
import clipboardy from 'clipboardy'
import { logger } from './config.js'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdir } from 'fs/promises'
import { startNode, appContext, applyAutomaticBonus } from './core.js'
import { calculateBalance, getNonce, calculateDailyTransactionSum } from './ledger.js'

let peerAddress = process.argv[3]
if (peerAddress === 'null') peerAddress = null;
const customDataDir = process.argv[4]

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const GLOBAL_LEDGER_TOPIC = '/invectis/global-ledger/1.0'

async function main() {
  const isFork = !!process.send;
  if (isFork) {
    logger.info('Starting in Forked/Test Mode...');
  } else {
    logger.prod('Starting in Console Mode...');
  }

  try {
    const dataDir = path.join(__dirname, 'data')
    await mkdir(dataDir, { recursive: true })
    const walletFileName = process.argv[2] || 'wallet.dat'
    const walletFile = path.join(dataDir, walletFileName)

    const wallet = await initializeWallet(walletFile, isFork ? null : rl)

    const datastorePath = customDataDir
      ? path.join(dataDir, customDataDir)
      : path.join(dataDir, `helia_${path.basename(walletFileName, '.dat')}`)

    if (!isFork) logger.prod(`Using datastore: ${datastorePath}`)

    const node = await startNode(wallet, datastorePath)

    if (isFork) {
      // In fork mode, we wait for the node to discover its address and then signal ready.
      logger.info('IPC: Waiting for node to be ready...');

      const readyPromise = new Promise((resolve) => {
        node.libp2p.addEventListener('self:peer:update', () => {
          const addrs = node.libp2p.getMultiaddrs();
          const wsAddr = addrs.find(addr => addr.toString().includes('/ws'));
          if (wsAddr) {
            resolve(wsAddr.toString());
          }
        });
      });

      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve(null), 15000); // 15s timeout
      });

      const wsAddress = await Promise.race([readyPromise, timeoutPromise]);

      if (wsAddress) {
        logger.info(`IPC: Node ready with address: ${wsAddress}`);
      } else {
        logger.warn('IPC: Timed out waiting for WebSocket address. Proceeding without it.');
      }

      process.send({ type: 'ready', address: wsAddress });
      setupIPCListeners();
      logger.info(`IPC: IPC listeners set up. Process will now idle.`);
    } else {
      // In console mode, run the interactive CLI
      const addresses = node.libp2p.getMultiaddrs();
      const peerId = node.libp2p.peerId.toString();
      logger.prod('\nListening addresses:')
      const fullAddresses = addresses.map(addr => `${addr.toString()}/p2p/${peerId}`);
      fullAddresses.forEach(addr => logger.prod(addr))

       if (!peerAddress) {
        try {
          const wsAddress = fullAddresses.find(addr => addr.includes('/ws'))
          if (wsAddress) {
            await clipboardy.write(wsAddress)
            logger.prod('\n✅ Full WebSocket multiaddress copied to clipboard!')
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
        runInteractiveCLI(peerAddress);
      }
    }

    process.on('SIGINT', async () => {
      logger.info('\nShutting down node...')
      if (!isFork) rl.close()

      if (appContext.replicationManager) {
        appContext.replicationManager.stop()
      }
      if (appContext.node) {
        await appContext.node.stop()
        await appContext.node.datastore.close();
      }
      if (appContext.pinManager) {
        await appContext.pinManager.close()
      }
      process.exit(0)
    })

  } catch (error) {
    logger.error('Fatal Error:', error)
    process.exit(1)
  }
}

function runInteractiveCLI(peerAddress) {
    const ma = multiaddr(peerAddress)
    const recipientPeerId = peerIdFromString(ma.getPeerId())

    const askForTransaction = () => {
      rl.question('\n(1: Pay, 2: Vector, 3: Rates, 4: Bonus, 5: AskVal, 6: ValAcc, 7: PollQ, 8: PollA, 9: Info, 0: Heads, P: Pin, G: GC)? ', async (choice) => {
        let payload
        let type

        try {
          switch (choice.toUpperCase()) {
            case 'G':
              logger.prod('Starting manual garbage collection...');
              try {
                const deletedCount = await appContext.gc.run(appContext.dagHeads);
                logger.prod(`✅ GC complete. Deleted ${deletedCount} block(s).`);
              } catch (err) {
                logger.error(`GC error: ${err.message}`);
              } finally {
                askForTransaction();
              }
              return;
            case 'P':
              rl.question('Enter CID to pin: ', async (cidString) => {
                try {
                  const cid = CID.parse(cidString.trim());
                  await appContext.pinManager.pin(cid);
                  logger.prod(`✅ Successfully pinned ${cid.toString()}`);
                } catch (err) {
                  logger.error(`Invalid CID or pinning error: ${err.message}`);
                } finally {
                  askForTransaction();
                }
              });
              return;
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
                const balance = await calculateBalance(appContext.wallet.peerId.toString(), appContext.dagHeads, appContext.j);

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
                    const nonce = await getNonce(appContext.wallet.peerId.toString(), appContext.dagHeads, appContext.j);
                    const paymentPayload = createPaymentPayload(appContext.wallet, recipientPeerId, amount, nonce, 'Payment', `ref-payment-${nonce}`);

                    const paymentTransactionToSign = {
                      parents: appContext.dagHeads.map(cid => cid.toString()),
                      author: appContext.wallet.peerId.toString(),
                      timestamp: Date.now(),
                      type,
                      payload: paymentPayload
                    };
                    const signedPaymentTransaction = await signTransaction(paymentTransactionToSign, appContext.wallet.sign);
                    const paymentCid = await appContext.j.add(signedPaymentTransaction);
                    const parentStrings = signedPaymentTransaction.parents || [];
                    const remainingHeads = appContext.dagHeads.filter(h => !parentStrings.includes(h.toString()));
                    appContext.dagHeads = [...remainingHeads, paymentCid];
                    const paymentMessageBytes = new TextEncoder().encode(JSON.stringify(signedPaymentTransaction));
                    await appContext.node.libp2p.services.pubsub.publish(GLOBAL_LEDGER_TOPIC, paymentMessageBytes);
                    logger.info('✅ Payment transaction published to the network!');
                  } catch (e) {
                    logger.error('Error creating payment:', e.message);
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
                const nonce = await getNonce(appContext.wallet.peerId.toString(), appContext.dagHeads, appContext.j)
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
                const walletBalance = await calculateBalance(appContext.wallet.peerId.toString(), appContext.dagHeads, appContext.j);
                const dailyTransactionSum = await calculateDailyTransactionSum(appContext.wallet.peerId.toString(), appContext.dagHeads, appContext.j);

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
              parents: appContext.dagHeads.map(cid => cid.toString()),
              author: appContext.wallet.peerId.toString(),
              timestamp: Date.now(),
              type,
              payload
            }

            const signedTransaction = await signTransaction(transactionToSign, appContext.wallet.sign)
            const cid = await appContext.j.add(signedTransaction)

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

function setupIPCListeners() {
    process.on('message', async (message) => {
        try {
            switch (message.command) {
                case 'create-tx':
                    const { type, payload } = message.data;
                    const txToSign = {
                        parents: appContext.dagHeads.map(cid => cid.toString()),
                        author: appContext.wallet.peerId.toString(),
                        timestamp: Date.now(),
                        type,
                        payload
                    };
                    const signedTx = await signTransaction(txToSign, appContext.wallet.sign);
                    const cid = await appContext.j.add(signedTx);
                    // Manually provide the new CID to the network. Don't await, let it run in the background.
                    appContext.node.libp2p.contentRouting.provide(cid).catch(err => {
                        logger.warn(`IPC: Could not provide CID ${cid.toString()}: ${err.message}`);
                    });
                    const parentStrings = signedTx.parents || [];
                    const remainingHeads = appContext.dagHeads.filter(h => !parentStrings.includes(h.toString()));
                    appContext.dagHeads = [...remainingHeads, cid];
                    const msgBytes = new TextEncoder().encode(JSON.stringify(signedTx));
                    try {
                      await appContext.node.libp2p.services.pubsub.publish(GLOBAL_LEDGER_TOPIC, msgBytes);
                    } catch (err) {
                      // In a test environment with no peers, this might fail. We can ignore it.
                      logger.warn(`IPC: Could not publish tx ${cid.toString()} to network: ${err.message}`);
                    }
                    process.send({ type: 'result', id: message.id, data: cid.toString() });
                    break;

                case 'pin-cid':
                    await appContext.pinManager.pin(CID.parse(message.data.cid));
                    process.send({ type: 'result', id: message.id, data: 'success' });
                    break;

                case 'run-gc':
                    const deletedCount = await appContext.gc.run(appContext.dagHeads);
                    process.send({ type: 'result', id: message.id, data: deletedCount });
                    break;

                case 'get-tx':
                    const tx = await appContext.j.get(CID.parse(message.data.cid));
                    process.send({ type: 'result', id: message.id, data: tx });
                    break;

                case 'get-providers':
                    const providers = [];
                    for await (const provider of appContext.node.libp2p.contentRouting.findProviders(CID.parse(message.data.cid))) {
                        providers.push(provider);
                    }
                    process.send({ type: 'result', id: message.id, data: providers.length });
                    break;

                case 'get-reputation':
                    const score = appContext.reputationManager.getScore(message.data.peerId);
                    process.send({ type: 'result', id: message.id, data: score });
                    break;

                case 'stop':
                    process.emit('SIGINT');
                    break;
            }
        } catch (err) {
            process.send({ type: 'error', id: message.id, message: err.message, stack: err.stack });
        }
    });
}

main();
