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
import { calculateBalance, getNonce } from './ledger.js'

const GLOBAL_LEDGER_TOPIC = '/invectis/global-ledger/1.0'

async function main() {
  const isFork = !!process.send;
  if (isFork) {
    logger.info('Starting in Forked/Test Mode...');
  } else {
    logger.prod('Starting in Console Mode...');
  }

  try {
    const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
    await mkdir(dataDir, { recursive: true });

    const walletFileName = process.argv[2] || 'wallet.dat';
    const walletFile = path.join(dataDir, walletFileName);
    const peerAddress = process.argv[3] || null;
    const customDataDir = process.argv[4];

    const rl = isFork ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
    const wallet = await initializeWallet(walletFile, rl);

    const datastorePath = customDataDir
      ? path.join(dataDir, customDataDir)
      : path.join(dataDir, `helia_${path.basename(walletFileName, '.dat')}`);
    logger.prod(`Using datastore: ${datastorePath}`);

    const node = await startNode(wallet, datastorePath);

    if (!isFork) {
      const addresses = node.libp2p.getMultiaddrs();
      logger.prod('\nListening addresses:');
      addresses.forEach(addr => logger.prod(addr.toString()));

      if (!peerAddress) {
        try {
          const wsAddress = addresses.find(addr => addr.toString().includes('/ws'));
          if (wsAddress) {
            await clipboardy.write(wsAddress.toString());
            logger.prod('\n✅ Full WebSocket multiaddress copied to clipboard!');
          }
        } catch (error) {
          logger.warn('Could not copy to clipboard:', error.message);
        }
      }

      if (peerAddress) {
        try {
          logger.info(`\nConnecting to ${peerAddress}...`);
          await appContext.node.libp2p.dial(multiaddr(peerAddress));
          logger.prod('✅ Successfully connected to peer.');
          // The 2-second delay is no longer needed here, the retry logic in core.js is more robust
          runInteractiveCLI(rl, peerAddress);
        } catch (error) {
          logger.error('Connection error:', error);
          logger.info('Node will continue to run in listening mode.');
          runInteractiveCLI(rl);
        }
      } else {
        runInteractiveCLI(rl);
      }
    }
    // IPC logic for forked processes would go here...

    process.on('SIGINT', async () => {
      logger.info('\nShutting down node...');
      if (rl) rl.close();
      if (appContext.node) await appContext.node.stop();
      if (appContext.pinManager) await appContext.pinManager.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Fatal Error:', error);
    process.exit(1);
  }
}

function runInteractiveCLI(rl, peerAddress = null) {
    const recipientPeerId = peerAddress ? peerIdFromString(multiaddr(peerAddress).getPeerId()) : null;
    askForTransaction(rl, recipientPeerId);
}

function askForTransaction(rl, recipientPeerId) {
      rl.question('\n(1: Pay, 2: Vector, ...)? ', async (choice) => {
        let payload;
        let type;

        try {
          switch (choice.toUpperCase()) {
            case '1': {
                if (!recipientPeerId) {
                    logger.error('You must be connected to a peer to send a payment.');
                    break;
                }
                type = 'PAYMENT';
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
                payload = createPaymentPayload(appContext.wallet, recipientPeerId, amount, nonce);
                break;
            }
            // All other cases would follow a similar pattern
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
            // The main transaction publish does not need the retry logic,
            // as the bonus transaction would have already warmed up the connection.
            await appContext.node.libp2p.services.pubsub.publish(GLOBAL_LEDGER_TOPIC, messageBytes);
            logger.info('✅ Transaction published to the network!');
          }
        } catch (error) {
          logger.error('Error sending transaction:', error); // Verbose error logging
        }
        askForTransaction(rl, recipientPeerId);
      });
}

main();
