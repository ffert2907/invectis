import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdir, readdir, readFile, writeFile } from 'fs/promises'
import { logger } from './config.js'
import { loadWalletFromFile, createWallet } from './wallet.js'
import { startNode, appContext } from './core.js'
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
  createInformationPayload
} from './transaction.js'
import { peerIdFromString } from '@libp2p/peer-id'

const PORT = process.env.PORT || 3000
const WALLET_FILE = process.argv[2] || 'wallet.dat'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function main() {
  logger.prod('Starting in Server Mode...')

  const dataDir = path.join(__dirname, 'data')
  const walletFile = path.join(dataDir, WALLET_FILE)

  try {
    // Setup data directory and wallet path relative to the script file
    await mkdir(dataDir, { recursive: true })
    const datastorePath = path.join(dataDir, 'helia_server')

    // Load wallet (non-interactive)
    // const wallet = await loadWalletFromFile(walletFile)

    // Start the core P2P node
    // await startNode(wallet, datastorePath)

    // Setup Express server
    const app = express()
    app.use(cors())
    app.use(express.json())

    // --- API Routes ---

    // GET /wallets
    app.get('/wallets', async (req, res) => {
      const dataDir = path.join(__dirname, 'data');
      try {
        const files = await readdir(dataDir);
        const walletFiles = files.filter(file => file.endsWith('.json') || file.endsWith('.dat'));
        const wallets = [];
        for (const file of walletFiles) {
          const filePath = path.join(dataDir, file);
          const walletData = await readFile(filePath, 'utf8');
          const wallet = JSON.parse(walletData);
          wallet.id = file;
          wallet.name = wallet.name || file.replace(/\.(json|dat)$/, '');
          wallet.address = wallet.address || `addr_${file.slice(0,12)}...`; // Mock address
          wallet.balance = {
            main: Math.random() * 1000,
            vectors: Array(9).fill(0).map(() => Math.random() * 100)
          };
          wallets.push(wallet);
        }
        res.json(wallets);
      } catch (error) {
        if (error.code === 'ENOENT') {
          // data directory doesn't exist, return empty array
          return res.json([]);
        }
        logger.error(`Failed to get wallets: ${error.message}`);
        res.status(500).json({ error: 'Failed to get wallets' });
      }
    });

    // POST /wallets
    app.post('/wallets', async (req, res) => {
      const { name, country, city, idNumber, type } = req.body;
      const safeName = (name || '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const walletFileName = `${safeName || 'wallet'}_${Date.now()}.json`;
      const dataDir = path.join(__dirname, 'data');
      const filePath = path.join(dataDir, walletFileName);

      try {
        const walletDetails = {
          country,
          city,
          nationalId: idNumber,
          accountType: type
        };
        const { privateKey, ...walletData } = await createWallet(filePath, walletDetails);

        delete walletData.privateKey;

        const createdWalletForFrontend = {
          ...walletData,
          id: walletFileName,
          name: name,
          balance: { main: 0, vectors: Array(9).fill(0) },
          address: `addr...${walletFileName.slice(0, 8)}`
        };

        res.status(201).json(createdWalletForFrontend);
      } catch (error) {
        logger.error(`Failed to create wallet: ${error.message}`);
        res.status(500).json({ error: 'Failed to create wallet', details: error.message });
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

    // GET /status
    app.get('/status', (req, res) => {
      if (!appContext.node || !appContext.wallet.peerId) {
        return res.status(503).json({ error: 'Node not ready' })
      }
      const connections = appContext.node.libp2p.getConnections()
      res.json({
        peerId: appContext.wallet.peerId.toString(),
        addresses: appContext.node.libp2p.getMultiaddrs().map(a => a.toString()),
        activeConnections: connections.length,
        peers: connections.map(c => c.remotePeer.toString())
      })
    })

    // GET /vectors
    app.get('/vectors', (req, res) => {
      res.json(VECTORS);
    });

    // GET /messages
    app.get('/messages', (req, res) => {
      res.json(appContext.receivedMessages)
    })

    // POST /publish
    app.post('/publish', async (req, res) => {
      const { type, payload } = req.body

      if (!type || !payload) {
        return res.status(400).json({ error: 'Missing type or payload' })
      }

      if (!appContext.node) {
        return res.status(503).json({ error: 'Node not ready' });
      }

      try {
        let transactionPayload
        const { description, reference } = payload;

        // A helper to get recipient PeerId from string
        const getRecipientPeerId = (recipient) => {
            if (!recipient) throw new Error('Recipient PeerId is required for this transaction type');
            return peerIdFromString(recipient);
        }

        switch (type.toUpperCase()) {
          case 'PAYMENT':
            transactionPayload = createPaymentPayload(appContext.wallet, getRecipientPeerId(payload.to), description, reference)
            break
          case 'VECTOR_TRANSACTION':
            transactionPayload = await createVectorPayload(appContext.wallet, getRecipientPeerId(payload.to), payload.vectors, description, reference)
            break
          case 'SETRATERATIO':
            transactionPayload = createSetRateRatioPayload(appContext.wallet, payload.rates, description, reference)
            break
          case 'SETDAILYBONUS':
            transactionPayload = createSetDailyBonusPayload(appContext.wallet, payload.walletBalance, payload.dailyTransactionSum, description, reference)
            break
          case 'ASK_VALIDATION_ACCOUNT':
            transactionPayload = createAskValidationAccountPayload(appContext.wallet, getRecipientPeerId(payload.to), description, reference)
            break
          case 'ACCOUNT_VALIDATION':
            transactionPayload = createAccountValidationPayload(appContext.wallet, getRecipientPeerId(payload.to), description, reference)
            break
          case 'POLL_QUESTION':
            transactionPayload = createPollQuestionPayload(appContext.wallet, payload.question, payload.pollType, payload.options, description, reference)
            break
          case 'POLL_ANSWER':
            transactionPayload = createPollAnswerPayload(appContext.wallet, payload.pollId, payload.answer, description, reference)
            break
          case 'INFORMATION':
            transactionPayload = createInformationPayload(appContext.wallet, payload.message, description, reference)
            break
          default:
            return res.status(400).json({ error: `Unknown transaction type: ${type}` })
        }

        if (!transactionPayload) {
            return res.status(400).json({ error: 'Transaction could not be created. Check payload or conditions (e.g., daily bonus).' });
        }

        // Build, sign, and publish the transaction
        const transactionToSign = {
          parents: appContext.dagHeads.map(cid => cid.toString()),
          author: appContext.wallet.peerId.toString(),
          timestamp: Date.now(),
          type: type.toUpperCase(),
          payload: transactionPayload
        }

        const signedTransaction = await signTransaction(transactionToSign, appContext.wallet.sign)

        const cid = await appContext.j.add(signedTransaction)
        appContext.dagHeads = [...appContext.dagHeads, cid] // Optimistic update

        const messageBytes = new TextEncoder().encode(JSON.stringify(signedTransaction))
        await appContext.node.libp2p.services.pubsub.publish('/invectis/global-ledger/1.0', messageBytes)

        logger.info(`API: Published transaction of type ${type} with CID ${cid.toString()}`)
        res.status(202).json({ message: 'Transaction published successfully', cid: cid.toString() })

      } catch (error) {
        logger.error(`API: Failed to publish transaction: ${error.message}`)
        res.status(500).json({ error: 'Failed to publish transaction', details: error.message })
      }
    })

    // Start server
    const server = app.listen(PORT, () => {
      logger.prod(`🚀 Server is running at http://localhost:${PORT}`)
      logger.prod(`✅ Wallet loaded: ${walletFile}`)
    })

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('\nSIGINT received. Shutting down server and P2P node...')
      server.close()
      if (appContext.node) {
        await appContext.node.stop()
      }
      process.exit(0)
    })

  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.error(`Wallet file not found at ${walletFile}. Please create a wallet first by running the console mode: node index.js ${WALLET_FILE}`)
    } else {
      logger.error('Failed to start server:', error)
    }
    process.exit(1)
  }
}

main()
