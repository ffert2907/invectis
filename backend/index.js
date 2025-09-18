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
      // In fork mode, logic for automated testing...
    } else {
      // In console mode, run the interactive CLI
      const addresses = node.libp2p.getMultiaddrs();
      logger.prod('\nListening addresses:')
      addresses.forEach(addr => logger.prod(addr.toString()))

       if (!peerAddress) {
        try {
          const wsAddress = addresses.find(addr => addr.toString().includes('/ws'))
          if (wsAddress) {
            await clipboardy.write(wsAddress.toString())
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
          runInteractiveCLI(peerAddress);
        } catch (error) {
          logger.error('Connection error:', error)
          logger.info('Node will continue to run in listening mode.')
          askForTransaction() // Allow local commands even if connection fails
        }
      } else {
          askForTransaction()
      }
    }

    process.on('SIGINT', async () => {
      logger.info('\nShutting down node...')
      if (!isFork) rl.close()
      if (appContext.node) await appContext.node.stop()
      if (appContext.pinManager) await appContext.pinManager.close()
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
    askForTransaction(recipientPeerId)
}

function askForTransaction(recipientPeerId = null) {
      rl.question('\n(1: Pay, 2: Vector, 3: Rates, 4: Bonus, 5: AskVal, 6: ValAcc, 7: PollQ, 8: PollA, 9: Info, 0: Heads, P: Pin, G: GC)? ', async (choice) => {
        let payload;
        let type;

        try {
          switch (choice.toUpperCase()) {
            case 'G':
              logger.prod('Starting manual garbage collection...');
              await appContext.gc.run(appContext.dagHeads);
              break;
            case 'P':
              rl.question('Enter CID to pin: ', async (cidString) => {
                try {
                  await appContext.pinManager.pin(CID.parse(cidString.trim()));
                  logger.prod(`✅ Successfully pinned ${cidString}`);
                } catch (err) {
                  logger.error(`Invalid CID or pinning error:`, err);
                } finally {
                  askForTransaction(recipientPeerId);
                }
              });
              return;
            case '0':
              logger.prod('\n--- Current Ledger Heads ---');
              // Logic for displaying heads
              break;
            case '1':
              {
                if (!recipientPeerId) {
                    logger.error('You must be connected to a peer to send a payment.');
                    break;
                }
                type = 'PAYMENT';
                logger.info('--- Create a new Payment ---');
                await applyAutomaticBonus();
                const balance = await calculateBalance(appContext.wallet.peerId.toString(), appContext.dagHeads, appContext.j);
                logger.info(`Your current account balance is: ${balance}`);
                if (balance <= 0) {
                  logger.warn('You have no funds to send.');
                  break;
                }
                const amountStr = await new Promise(resolve => rl.question(`Enter amount to send (max ${balance}): `, resolve));
                const amount = parseFloat(amountStr);
                if (isNaN(amount) || amount <= 0 || amount > balance) {
                    logger.error('Invalid amount.');
                    break;
                }
                const nonce = await getNonce(appContext.wallet.peerId.toString(), appContext.dagHeads, appContext.j);
                payload = createPaymentPayload(appContext.wallet, recipientPeerId, amount, nonce, 'Payment', `ref-payment-${nonce}`);
                break;
              }
            // Other cases remain
            default:
              logger.warn('Invalid choice.');
              break;
          }

          if (payload) {
            const transactionToSign = {
              parents: appContext.dagHeads.map(cid => cid.toString()),
              author: appContext.wallet.peerId.toString(),
              timestamp: Date.now(),
              type,
              payload
            };
            const signedTransaction = await signTransaction(transactionToSign, appContext.wallet.sign);
            const cid = await appContext.j.add(signedTransaction);
            appContext.dagHeads = [...appContext.dagHeads.filter(h => !transactionToSign.parents.includes(h.toString())), cid];
            const messageBytes = new TextEncoder().encode(JSON.stringify(signedTransaction));
            await appContext.node.libp2p.services.pubsub.publish(GLOBAL_LEDGER_TOPIC, messageBytes);
            logger.info('✅ Transaction published to the network!');
          }
        } catch (error) {
          logger.error('Error sending transaction:', error);
        }
        askForTransaction(recipientPeerId);
      });
}

main().catch(err => {
    logger.error("Unhandled error in main:", err);
    process.exit(1);
});
