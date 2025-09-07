//<<<<<<< feat/api-server
import { initializeWallet } from './wallet.js'
//=======
//import express from 'express';
//import cors from 'cors';
//import fs from 'fs/promises';
//import { createWallet, initializeWallet } from './wallet.js';
//import { createNode } from './p2p.js';
//>>>>>>> main
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
//<<<<<<< feat/api-server
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
//=======
//import { formatTransactionForFrontend } from './api.js';
//import { multiaddr } from '@multiformats/multiaddr';
//import { peerIdFromString, createFromPubKey } from '@libp2p/peer-id';
//import { keys } from '@libp2p/crypto';
//import clipboardy from 'clipboardy';
//import { config, logger } from './config.js';
//import path from 'path';
//import { mkdir } from 'fs/promises';
//import { json } from '@helia/json';
//import { createHash } from 'crypto';

//// Configuration des arguments de ligne de commande
//const peerAddress = process.argv[3];
//const customDataDir = process.argv[4]; // Argument optionnel pour le répertoire de données

//// Topic GossipSub pour le registre global
//const GLOBAL_LEDGER_TOPIC = '/invectis/global-ledger/1.0';

//async function main() {
//  // Garde une trace des "têtes" du DAG (transactions sans enfants)
//  let dagHeads = [];

//  try {
//    logger.prod(`Lancement en mode: ${config.appMode}`);

//    // Création du répertoire de données et définition du chemin du portefeuille
//    const dataDir = 'data';
//    await mkdir(dataDir, { recursive: true });
//    // For a server, we might not have a specific wallet file from args,
//    // but we need to initialize a node identity. Let's create/load a default one.
//    const walletFile = path.join(dataDir, process.argv[2] || 'node_wallet.dat');

//    // Initialisation du portefeuille/identité du noeud
//    logger.info('Initialisation de l\'identité du noeud...');
//    // We remove readline from initializeWallet or bypass it
//    const wallet = await initializeWallet(walletFile, null, true); // `true` to auto-create

//    // Détermine le chemin du datastore
//    const datastorePath = customDataDir
//      ? path.join('data', customDataDir)
//      : path.join('data', 'helia');
//    logger.prod(`Utilisation du datastore: ${datastorePath}`);

//    // Initialisation du nœud P2P
//    logger.info('Initialisation du nœud P2P...');
//    const node = await createNode(wallet.privateKey, datastorePath);
//    const j = json(node);

//    // Augmenter l'objet wallet avec les informations dérivées du noeud
//    wallet.peerId = node.libp2p.peerId;
//    wallet.sign = (data) => wallet.privateKey.sign(data);

//    logger.info('Identité du noeud:', wallet.peerId.toString());

//    // Démarrage du nœud
//    await node.start();
//    logger.prod('Nœud P2P démarré avec succès');

//    // Affichage des adresses d'écoute
//    const addresses = node.libp2p.getMultiaddrs();
//    logger.prod('\nAdresses d\'écoute:');
//    addresses.forEach(addr => logger.prod(addr.toString()));
//>>>>>>> main

    // Copie automatique de l'adresse WebSocket dans le presse-papiers
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

    // Connexion manuelle à un pair si une adresse est fournie
    if (peerAddress) {
//<<<<<<< feat/api-server
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
//=======
//        try {
//            logger.info(`\nConnexion à ${peerAddress}...`);
//            const ma = multiaddr(peerAddress);
//            const connection = await node.libp2p.dial(ma);
//            logger.prod('✅ Connecté avec succès');
//        } catch (error) {
//            logger.error('Erreur de connexion:', error.message);
//        }
//    }

//    // --- MISE EN PLACE DU SERVEUR API ---
//    const app = express();
//    app.use(cors());
//    app.use(express.json());
//    const PORT = process.env.PORT || 3001;

//    app.get('/status', (req, res) => {
//      const connections = node.libp2p.getConnections();
//      res.json({
//        peerId: node.libp2p.peerId.toString(),
//        connectionCount: connections.length,
//        addresses: node.libp2p.getMultiaddrs().map(a => a.toString())
//      });
//    });

//    app.post('/wallets', async (req, res) => {
//        try {
//            const { name, country, city, idNumber, type } = req.body;
//            if (!name || !country || !city || !idNumber || !type) {
//            return res.status(400).json({ message: 'Missing required fields' });
//            }

 //           const walletFileName = `${name.replace(/\s/g, '_')}.json`;
 //           const filePath = path.join('data', walletFileName);

//            const newWallet = await createWallet(filePath, {
//                name,
//                country,
//                city,
//                nationalId: idNumber,
//                accountType: type
//            });

//            // We need to derive the peerId for the new wallet to return it
//            const privateKey = await keys.unmarshalPrivateKey(Buffer.from(newWallet.privateKey, 'base64'));
//            const peerId = await createFromPubKey(privateKey.public);

//            const newWalletResponse = {
//                ...newWallet,
//                id: newWallet.created,
//                address: peerId.toString(), // Use the real peerId as the address
//                balance: { main: 0, vectors: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
//            }

//            res.status(201).json(newWalletResponse);
//        } catch (error) {
//            logger.error('Error creating wallet:', error);
//            res.status(500).json({ message: 'Failed to create wallet' });
//        }
//    });

//    app.get('/wallets', async (req, res) => {
//        try {
//            const files = await fs.readdir('data');
//            const wallets = await Promise.all(files
//                .filter(file => file.endsWith('.json')) // Filter out non-wallet files like node_wallet.dat
//                .map(async (file) => {
//                    const filePath = path.join('data', file);
//                    const fileContent = await fs.readFile(filePath, 'utf-8');
//                    const walletData = JSON.parse(fileContent);
//                    const privateKey = await keys.unmarshalPrivateKey(Buffer.from(walletData.privateKey, 'base64'));
//                    const peerId = await createFromPubKey(privateKey.public);
//                    return {
//                        ...walletData,
//                        id: walletData.created,
//                        name: walletData.name || file.replace('.json', '').replace(/_/g, ' '),
//                        address: peerId.toString(),
//                        balance: { main: 0, vectors: [0, 0, 0, 0, 0, 0, 0, 0, 0] }
//                    };
//            }));
//            res.json(wallets);
//        } catch (error) {
//            logger.error('Error reading wallets directory:', error);
//            res.status(500).json({ message: 'Failed to read wallets directory' });
//        }
//    });

//    app.post('/wallets/import', async (req, res) => {
//        try {
//            const { walletData, name } = req.body;
//            if (!walletData || !name) {
//            return res.status(400).json({ message: 'Missing required fields' });
//            }

//            const parsedWallet = JSON.parse(walletData);
//            if (!parsedWallet.version || !parsedWallet.privateKey) {
//            return res.status(400).json({ message: 'Invalid wallet file' });
//            }

//            const walletFileName = `${name.replace(/\s/g, '_')}.json`;
//            const filePath = path.join('data', walletFileName);

//            await fs.writeFile(filePath, walletData, 'utf8');

//            res.status(200).json({ message: 'Wallet imported successfully' });
//        } catch (error) {
//            logger.error('Error importing wallet:', error);
//            res.status(500).json({ message: 'Failed to import wallet' });
  //      }
  //  });

 //   app.listen(PORT, () => {
 //    logger.info(`API server is running on http://localhost:${PORT}`);
 //   });
 //   // --- FIN DU SERVEUR API ---


 //   // Gestion de la fermeture propre
 //   process.on('SIGINT', async () => {
 //     logger.info('\nFermeture du nœud et du serveur...');
 //     await node.stop();
 //     process.exit(0);
 //   });

//  } catch (error) {
//    logger.error('Erreur principale:', error);
//    logger.debug('Stack trace complet:', error);
//    process.exit(1);
//>>>>>>> main
  }
}

// Lancement de l'application
main();
