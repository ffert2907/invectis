import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdir, readdir, readFile, writeFile } from 'fs/promises'
import { logger } from './config.js'
import { loadWalletFromFile, createWallet } from './wallet.js'
import { startNode, appContext, applyAutomaticBonus, startTransactionQueueProcessor, createAndSetAttestation } from './core.js'
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
  const datastorePath = path.join(dataDir, 'helia_server');
  await mkdir(dataDir, { recursive: true });

  // Determine which wallet to load on startup
  const lastActiveWallet = await getLastActiveWallet();
  const walletToLoad = lastActiveWallet || WALLET_FILE;
  const walletFile = path.join(dataDir, walletToLoad);

  // Try to load the determined wallet and start the node at boot.
  try {
    const wallet = await loadWalletFromFile(walletFile);
    await startNode(wallet, datastorePath);
    logger.prod(`✅ Wallet ${walletToLoad} loaded and P2P node started.`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.warn(`Default wallet not found. Server is running in API-only mode.`);
      logger.warn('Create or activate a wallet via the API to start the P2P node.');
    } else {
      // For other errors during initial load, we should probably exit.
      logger.error('A critical error occurred during initial wallet load:', error);
      process.exit(1);
    }
  }

  // Setup Express server (this now runs regardless of whether the node started)
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Start the background queue processor
  startTransactionQueueProcessor();

  // --- API Routes ---

  // GET /wallets
  app.get('/wallets', async (req, res) => {
    const dataDir = path.join(__dirname, 'data');
    try {
      const files = await readdir(dataDir);
      const walletFiles = files.filter(file => file.endsWith('.json') || file.endsWith('.dat'));
      const wallets = [];
      for (const file of walletFiles) {
        try {
          const filePath = path.join(dataDir, file);
          const loadedWallet = await loadWalletFromFile(filePath, { quiet: true });
          const balance = await calculateBalance(loadedWallet.peerId.toString(), appContext.dagHeads, appContext.j);
          const walletInfo = {
            id: file,
            name: file.replace(/\.(json|dat)$/, ''),
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
      const transactions = await getTransactions(peerId, appContext.dagHeads, appContext.j);
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
    const safeName = (name || '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const walletFileName = `${safeName || 'wallet'}_${Date.now()}.json`;
    const dataDir = path.join(__dirname, 'data');
    const filePath = path.join(dataDir, walletFileName);
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
      } = await createWallet(filePath, walletDetails);

      // If no node is active, activate it with the new wallet.
      if (!appContext.node) {
        logger.info('No active P2P node found. Activating node with new wallet...');
        const datastorePath = path.join(dataDir, 'helia_server');
        const walletToActivate = await loadWalletFromFile(filePath);
        await startNode(walletToActivate, datastorePath);
        await saveLastActiveWallet(walletFileName); // Save the new wallet as the last active one
        logger.prod(`✅ Wallet ${walletFileName} activated and P2P node started.`);
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
        id: walletFileName,
        name: name,
        balance: {
          main: 0,
          vectors: Array(9).fill(0)
        },
        address: `addr...${walletFileName.slice(0, 8)}`
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
    const dataDir = path.join(__dirname, 'data');
    const safeName = name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
    const filePath = path.join(dataDir, safeName);
    try {
      const parsedData = JSON.parse(walletData);
      if (parsedData.version !== '1.0' || !parsedData.privateKey) {
        throw new Error('Invalid wallet data format for import.');
      }
      await writeFile(filePath, JSON.stringify(parsedData, null, 2), 'utf8');
      res.status(200).json({ message: 'Wallet imported successfully' });
    } catch (error) {
      logger.error(`Failed to import wallet: ${error.message}`);
      res.status(500).json({ error: 'Failed to import wallet', details: error.message });
    }
  });

  // POST /wallets/activate
  app.post('/wallets/activate', async (req, res) => {
    const { walletId } = req.body;
    if (!walletId) {
      return res.status(400).json({ error: 'walletId is required' });
    }

    const dataDir = path.join(__dirname, 'data');
    const walletFile = path.join(dataDir, walletId);

    try {
      // Load the new wallet from file
      const newWallet = await loadWalletFromFile(walletFile);

      // Case 1: Node is not running yet. Start it with the selected wallet.
      if (!appContext.node) {
        logger.info(`No active node found. Starting node with wallet: ${walletId}`);
        const datastorePath = path.join(dataDir, 'helia_server');
        await startNode(newWallet, datastorePath);
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
      appContext.dagHeads = [...appContext.dagHeads, cid];
      const messageBytes = new TextEncoder().encode(JSON.stringify(signedTransaction));
      await appContext.node.libp2p.services.pubsub.publish('/invectis/global-ledger/1.0', messageBytes);
      logger.info(`API: Published transaction of type ${type} with CID ${cid.toString()}`);
      res.status(202).json({ message: 'Transaction published successfully', cid: cid.toString() });
    } catch (error) {
      logger.error(`API: Failed to publish transaction: ${error.message}`);
      res.status(500).json({ error: 'Failed to publish transaction', details: error.message });
    }
  });

  // Start server
  const server = app.listen(PORT, () => {
    logger.prod(`🚀 Server is running at http://localhost:${PORT}`);
    if (appContext.node) {
      logger.prod(`✅ Wallet loaded: ${walletFile}`);
      const allAddresses = appContext.node.libp2p.getMultiaddrs().map(a => a.toString());
      const localWsAddress = allAddresses.find(a => a.includes('/ip4/127.0.0.1/') && a.includes('/ws'));
      if (localWsAddress) {
        logger.prod('------------------------------------------------------------------');
        logger.prod('To connect a local client, use this address:');
        logger.prod(localWsAddress);
        logger.prod('------------------------------------------------------------------');
      }
    }
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('\nSIGINT received. Shutting down server and P2P node...');
    server.close();
    if (appContext.node) {
      await appContext.node.stop();
    }
    process.exit(0);
  });
}

main()
