import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdir, readdir, readFile, writeFile } from 'fs/promises'
import { logger } from './config.js'
import { loadWallet, createWallet, initializeWallet } from './wallet.js'
import { startNode, appContext, applyAutomaticBonus, startTransactionQueueProcessor, createAndSetAttestation } from './core.js'
import { FsKeyStore } from './src/implementations/fs/fs-keystore.js';
import { FsIndexstore } from './src/implementations/fs/fs-indexstore.js';
import { Indexer } from './src/indexer.js';
import { VECTORS } from './vectors.js'
import {
  signTransaction,
  createPaymentPayload,
  createSetRateRatioPayload,
  createVectorPayload,
  createSetDailyBonusPayload,
  createAskValidationAccountPayload,
  createAccountValidationPayload,
  createPollQuestionPayload,
  createPollAnswerPayload,
  createInformationPayload,
  createRegisterPayload
} from './transaction.js'
import { peerIdFromString, peerIdFromPrivateKey } from '@libp2p/peer-id'
import { TextEncoder } from 'util'
import { calculateBalance, getTransactions } from './ledger.js'

const PORT = process.env.PORT || 3000
const WALLET_FILE = process.env.WALLET_FILE || process.argv[2] || 'wallet.dat'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const LAST_WALLET_FILE = path.join(__dirname, 'data', 'last_active_wallet.txt');

async function saveLastActiveWallet(walletId) {
  try {
    await writeFile(LAST_WALLET_FILE, walletId, 'utf8');
    logger.info(`Saved last active wallet: ${walletId}`);
  } catch (error) {
    logger.error(`Failed to save last active wallet: ${error.message}`);
  }
}

async function getLastActiveWallet() {
  try {
    const walletId = await readFile(LAST_WALLET_FILE, 'utf8');
    return walletId.trim();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // File doesn't exist, no last active wallet
    }
    logger.error(`Failed to read last active wallet: ${error.message}`);
    return null;
  }
}

async function main() {
  logger.prod('Starting in Server Mode...');

  const dataDir = path.join(__dirname, 'data');
  const walletDir = path.join(dataDir, 'wallets');
  const blockstorePath = path.join(dataDir, 'blockstore');
  const indexstorePath = path.join(dataDir, 'indexstore');
  await mkdir(walletDir, { recursive: true });

  // Setup stores
  const walletStore = new FsKeyStore(walletDir);
  const indexStore = new FsIndexstore(indexstorePath);
  await indexStore.open(); // Open the index store

  // Determine which wallet to load on startup
  const lastActiveWalletKey = await getLastActiveWallet();
  const walletKeyToLoad = lastActiveWalletKey || 'default_wallet';

  // Try to load the determined wallet. If it fails, start in relay-only mode.
  let wallet = null;
  try {
    wallet = await loadWallet(walletStore, walletKeyToLoad);
    if (wallet) {
      logger.info(`✅ Wallet ${walletKeyToLoad} loaded successfully.`);
    } else {
      logger.warn(`Default wallet not found. Starting server in relay-only mode.`);
    }
  } catch (error) {
      logger.error('A critical error occurred during initial wallet load:', error);
      process.exit(1);
  }

  // Start the node. It will be a full node if a wallet was loaded, otherwise relay-only.
  await startNode(wallet, blockstorePath, indexStore);

  // Setup Express server (this now runs regardless of whether the node started)
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Start the background queue processor
  startTransactionQueueProcessor();

  // --- API Routes ---

  // GET /wallets
  app.get('/wallets', async (req, res) => {
    const walletDir = path.join(__dirname, 'data', 'wallets');
    try {
      const files = await readdir(walletDir);
      const walletFiles = files.filter(file => file.endsWith('.json'));
      const wallets = [];
      for (const file of walletFiles) {
        const walletKey = file.replace('.json', '');
        try {
          const loadedWallet = await loadWallet(walletStore, walletKey, { quiet: true });
          const balance = await calculateBalance(loadedWallet.peerId.toString(), appContext.dagHeads, appContext.j);
          const walletInfo = {
            id: walletKey,
            name: walletKey, // Or store a name inside the wallet data
            address: loadedWallet.peerId.toString(),
            balance: {
              main: balance,
              vectors: Array(9).fill(0)
            },
            accountType: loadedWallet.accountType,
            country: loadedWallet.country,
            city: loadedWallet.city,
          };
          wallets.push(walletInfo);
        } catch (loadError) {
          logger.error(`Could not load or process wallet ${file}: ${loadError.message}`);
        }
      }
      res.json(wallets);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.json([]);
      }
      logger.error(`Failed to get wallets: ${error.message}`);
      res.status(500).json({ error: 'Failed to get wallets' });
    }
  });

  // GET /wallets/:peerId/transactions
  app.get('/wallets/:peerId/transactions', async (req, res) => {
    const { peerId } = req.params;
    if (!peerId) {
      return res.status(400).json({ error: 'PeerId is required' });
    }
    try {
      // Now uses the appContext which holds the indexStore instance
      const transactions = await getTransactions(peerId, appContext);
      res.json(transactions);
    } catch (error) {
      logger.error(`Failed to get transactions for ${peerId}: ${error.message}`);
      res.status(500).json({ error: 'Failed to get transactions' });
    }
  });

  // POST /wallets
  app.post('/wallets', async (req, res) => {
    const {
      name,
      accountType,
      givenName,
      familyName,
      dateOfBirth,
      countryOfBirth,
      cityOfBirth
    } = req.body;
    const walletKey = (name || `wallet_${Date.now()}`).replace(/[^a-z0-9]/gi, '_').toLowerCase();

    try {
      const walletDetails = {
        accountType,
        givenName,
        familyName,
        dateOfBirth,
        countryOfBirth,
        cityOfBirth
      };
      const {
        privateKey,
        ...walletData
      } = await createWallet(walletStore, walletKey, walletDetails);

      // If no node is active, activate it with the new wallet.
      if (!appContext.node) {
        logger.info('No active P2P node found. Activating node with new wallet...');
        const walletToActivate = await loadWallet(walletStore, walletKey);
        await startNode(walletToActivate, blockstorePath, indexStore);
        await saveLastActiveWallet(walletKey); // Save the new wallet as the last active one
        logger.prod(`✅ Wallet ${walletKey} activated and P2P node started.`);
      }

      // For individual accounts, queue a registration transaction to be published.
      if (walletData.accountType === 'individual' && walletData.nullifier) {
        logger.info(`Queueing REGISTRATION transaction for ${walletData.peerId.toString()}`);
        const peerId = await peerIdFromPrivateKey(privateKey);
        const tempWallet = {
          peerId,
          privateKey,
          sign: (data) => privateKey.sign(data),
          accountType: walletData.accountType
        };

        const registerPayload = createRegisterPayload(tempWallet, walletData.nullifier);
        const transactionToSign = {
          parents: appContext.dagHeads.map(cid => cid.toString()),
          author: tempWallet.peerId.toString(),
          timestamp: Date.now(),
          type: 'REGISTER',
          payload: registerPayload
        };
        const signedTransaction = await signTransaction(transactionToSign, tempWallet.sign);

        // Add the transaction to the queue instead of publishing directly.
        appContext.publishQueue.push(signedTransaction);
        logger.info(`✅ REGISTRATION transaction for ${tempWallet.peerId.toString()} added to the queue.`);
      }
      const createdWalletForFrontend = {
        ...walletData,
        id: walletKey,
        name: name,
        balance: {
          main: 0,
          vectors: Array(9).fill(0)
        },
        address: walletData.peerId.toString()
      };
      delete createdWalletForFrontend.privateKey;
      res.status(201).json(createdWalletForFrontend);
    } catch (error) {
      logger.error(`Failed to create wallet: ${error.message}`);
      res.status(500).json({
        error: 'Failed to create wallet',
        details: error.message
      });
    }
  });

  // POST /wallets/import
  app.post('/wallets/import', async (req, res) => {
    const { name, walletData } = req.body;
    if (!name || !walletData) {
      return res.status(400).json({ error: 'Missing name or walletData' });
    }
    const walletKey = name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
    try {
      const parsedData = JSON.parse(walletData);
      if (parsedData.version !== '1.0' || !parsedData.privateKey) {
        throw new Error('Invalid wallet data format for import.');
      }
      await walletStore.save(walletKey, parsedData);
      res.status(200).json({ message: 'Wallet imported successfully' });
    } catch (error) {
      logger.error(`Failed to import wallet: ${error.message}`);
      res.status(500).json({ error: 'Failed to import wallet', details: error.message });
    }
  });

  // POST /wallets/activate
  app.post('/wallets/activate', async (req, res) => {
    const { walletId } = req.body; // Here walletId is the key
    if (!walletId) {
      return res.status(400).json({ error: 'walletId is required' });
    }

    try {
      // Load the new wallet from the store
      const newWallet = await loadWallet(walletStore, walletId);
      if (!newWallet) {
        return res.status(404).json({ error: `Wallet with id ${walletId} not found.`});
      }

      // Case 1: Node is not running yet. Start it with the selected wallet.
      if (!appContext.node) {
        logger.info(`No active node found. Starting node with wallet: ${walletId}`);
        await startNode(newWallet, blockstorePath, indexStore);
        logger.prod(`✅ Wallet ${walletId} activated and P2P node started.`);
      }
      // Case 2: Node is already running. Hot-swap the wallet.
      else {
        logger.info(`Node is running. Hot-swapping wallet to: ${walletId}`);
        // 1. Update wallet in context
        appContext.wallet = newWallet;
        // 2. Re-create and set the attestation for the new wallet
        appContext.attestation = await createAndSetAttestation(appContext.node, newWallet);
        logger.prod(`✅ Wallet switched to ${walletId} on running node.`);
      }

      // In both cases, save the activated wallet as the last active one
      await saveLastActiveWallet(walletId);

      res.status(200).json({ message: `Wallet ${walletId} activated successfully.` });

    } catch (error) {
      logger.error(`Failed to activate wallet ${walletId}:`, error);
      res.status(500).json({ error: `Failed to activate wallet ${walletId}`, details: error.message });
    }
  });

  // GET /status
  app.get('/status', (req, res) => {
    if (!appContext.node || !appContext.wallet || !appContext.attestation) {
      return res.status(200).json({ status: 'API_ONLY', message: 'Node not active. Create or activate a wallet.' });
    }
    const connections = appContext.node.libp2p.getConnections();
    res.json({
      status: 'ACTIVE',
      nodePeerId: appContext.node.libp2p.peerId.toString(),
      walletPeerId: appContext.wallet.peerId.toString(),
      addresses: appContext.node.libp2p.getMultiaddrs().map(a => a.toString()),
      activeConnections: connections.length,
      peers: connections.map(c => c.remotePeer.toString()),
      attestation: {
        expiresAt: appContext.attestation.attestation.expiresAt,
        nodePeerId: appContext.attestation.attestation.nodePeerId,
      }
    });
  });

  // GET /vectors
  app.get('/vectors', (req, res) => {
    res.json(VECTORS);
  });

  // GET /messages
  app.get('/messages', (req, res) => {
    res.json(appContext.receivedMessages);
  });

  // POST /publish
  app.post('/publish', async (req, res) => {
    const { type, payload } = req.body;
    if (!type || !payload) {
      return res.status(400).json({ error: 'Missing type or payload' });
    }
    if (!appContext.node) {
      return res.status(503).json({ error: 'Node not ready. Activate a wallet first.' });
    }
    try {
      let transactionPayload;
      const { description, reference } = payload;
      const getRecipientPeerId = (recipient) => {
        if (!recipient) throw new Error('Recipient PeerId is required for this transaction type');
        return peerIdFromString(recipient);
      }
      switch (type.toUpperCase()) {
        case 'PAYMENT':
          await applyAutomaticBonus();
          transactionPayload = createPaymentPayload(appContext.wallet, getRecipientPeerId(payload.to), payload.amount, payload.nonce, description, reference);
          break;
        case 'VECTOR_TRANSACTION':
          transactionPayload = await createVectorPayload(appContext.wallet, getRecipientPeerId(payload.to), payload.vectors, description, reference);
          break;
        case 'SETRATERATIO':
          transactionPayload = createSetRateRatioPayload(appContext.wallet, payload.rates, description, reference);
          break;
        case 'SETDAILYBONUS':
          transactionPayload = createSetDailyBonusPayload(appContext.wallet, payload.walletBalance, payload.dailyTransactionSum, description, reference);
          break;
        case 'ASK_VALIDATION_ACCOUNT':
          transactionPayload = createAskValidationAccountPayload(appContext.wallet, getRecipientPeerId(payload.to), description, reference);
          break;
        case 'ACCOUNT_VALIDATION':
          transactionPayload = createAccountValidationPayload(appContext.wallet, getRecipientPeerId(payload.to), description, reference);
          break;
        case 'POLL_QUESTION':
          transactionPayload = createPollQuestionPayload(appContext.wallet, payload.question, payload.pollType, payload.options, description, reference);
          break;
        case 'POLL_ANSWER':
          transactionPayload = createPollAnswerPayload(appContext.wallet, payload.pollId, payload.answer, description, reference);
          break;
        case 'INFORMATION':
          transactionPayload = createInformationPayload(appContext.wallet, payload.message, description, reference);
          break;
        default:
          return res.status(400).json({ error: `Unknown transaction type: ${type}` });
      }
      if (!transactionPayload) {
        return res.status(400).json({ error: 'Transaction could not be created. Check payload or conditions (e.g., daily bonus).' });
      }
      const transactionToSign = {
        parents: appContext.dagHeads.map(cid => cid.toString()),
        author: appContext.wallet.peerId.toString(),
        timestamp: Date.now(),
        type: type.toUpperCase(),
        payload: transactionPayload
      };
      const signedTransaction = await signTransaction(transactionToSign, appContext.wallet.sign);
      const cid = await appContext.j.add(signedTransaction);

      // Index the new transaction
      if (appContext.indexer) {
        await appContext.indexer.processTransaction(cid);
      }

      appContext.node.pin(cid);
      logger.info(`API: Pinned new transaction CID: ${cid.toString()}`);
      appContext.dagHeads = [...appContext.dagHeads, cid];
      const messageBytes = new TextEncoder().encode(JSON.stringify(signedTransaction));
      try {
        await appContext.node.libp2p.services.pubsub.publish('/invectis/global-ledger/1.0', messageBytes);
        logger.info(`API: Published transaction of type ${type} with CID ${cid.toString()}`);
      } catch (error) {
        if (error.message.includes('NoPeersSubscribedToTopic')) {
          logger.warn(`API: Could not publish transaction. No peers are subscribed to the topic. The transaction is still stored locally.`);
        } else {
          // For other errors, we let the main error handler catch it
          throw error;
        }
      }
      res.status(202).json({ message: 'Transaction published successfully', cid: cid.toString() });
    } catch (error) {
      logger.error(`API: Failed to publish transaction: ${error.message}`);
      res.status(500).json({ error: 'Failed to publish transaction', details: error.message });
    }
  });

  // Start server
  const server = app.listen(PORT, () => {
    logger.prod(`🚀 API Server is running at http://localhost:${PORT}`);
    if (appContext.node) {
      const allAddresses = appContext.node.libp2p.getMultiaddrs().map(a => a.toString());
      logger.prod('------------------------------------------------------------------');
      if (wallet) {
        logger.prod(`✅ P2P Node started with Wallet: ${wallet.peerId.toString()}`);
      } else {
        logger.prod('✅ P2P Node started in Relay-Only Mode');
      }
      logger.prod(`Node PeerId: ${appContext.node.libp2p.peerId.toString()}`);
      logger.prod('Listening on addresses:');
      allAddresses.forEach(addr => logger.prod(addr));
      logger.prod('------------------------------------------------------------------');
    }
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('\nSIGINT received. Shutting down server and P2P node...');
    server.close();
    if (appContext.node) {
      await appContext.node.stop();
    }
    await indexStore.close(); // Close the index store
    process.exit(0);
  });
}

main()
