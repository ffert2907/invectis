import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import { createWallet, initializeWallet } from './wallet.js';
import { createNode } from './p2p.js';
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
} from './transaction.js';
import { VECTORS } from './vectors.js';
import { formatTransactionForFrontend } from './api.js';
import { multiaddr } from '@multiformats/multiaddr';
import { peerIdFromString, createFromPubKey } from '@libp2p/peer-id';
import { keys } from '@libp2p/crypto';
import clipboardy from 'clipboardy';
import { config, logger } from './config.js';
import path from 'path';
import { mkdir } from 'fs/promises';
import { json } from '@helia/json';
import { createHash } from 'crypto';

// Configuration des arguments de ligne de commande
const peerAddress = process.argv[3];
const customDataDir = process.argv[4]; // Argument optionnel pour le répertoire de données

// Topic GossipSub pour le registre global
const GLOBAL_LEDGER_TOPIC = '/invectis/global-ledger/1.0';

async function main() {
  // Garde une trace des "têtes" du DAG (transactions sans enfants)
  let dagHeads = [];

  try {
    logger.prod(`Lancement en mode: ${config.appMode}`);

    // Création du répertoire de données et définition du chemin du portefeuille
    const dataDir = 'data';
    await mkdir(dataDir, { recursive: true });
    // For a server, we might not have a specific wallet file from args,
    // but we need to initialize a node identity. Let's create/load a default one.
    const walletFile = path.join(dataDir, process.argv[2] || 'node_wallet.dat');

    // Initialisation du portefeuille/identité du noeud
    logger.info('Initialisation de l\'identité du noeud...');
    // We remove readline from initializeWallet or bypass it
    const wallet = await initializeWallet(walletFile, null, true); // `true` to auto-create

    // Détermine le chemin du datastore
    const datastorePath = customDataDir
      ? path.join('data', customDataDir)
      : path.join('data', 'helia');
    logger.prod(`Utilisation du datastore: ${datastorePath}`);

    // Initialisation du nœud P2P
    logger.info('Initialisation du nœud P2P...');
    const node = await createNode(wallet.privateKey, datastorePath);
    const j = json(node);

    // Augmenter l'objet wallet avec les informations dérivées du noeud
    wallet.peerId = node.libp2p.peerId;
    wallet.sign = (data) => wallet.privateKey.sign(data);

    logger.info('Identité du noeud:', wallet.peerId.toString());

    // Démarrage du nœud
    await node.start();
    logger.prod('Nœud P2P démarré avec succès');

    // Affichage des adresses d'écoute
    const addresses = node.libp2p.getMultiaddrs();
    logger.prod('\nAdresses d\'écoute:');
    addresses.forEach(addr => logger.prod(addr.toString()));

    // Copie automatique de l'adresse WebSocket dans le presse-papiers
     if (!peerAddress) {
      try {
        const wsAddress = addresses.find(addr => addr.toString().includes('/ws'))
        if (wsAddress) {
          await clipboardy.write(wsAddress.toString())
          logger.prod('\n✅ Adresse WebSocket copiée dans le presse-papiers!')
        }
      } catch (error) {
        logger.warn('Impossible de copier dans le presse-papiers:', error.message)
      }
    }

    // Connexion manuelle à un pair si une adresse est fournie
    if (peerAddress) {
        try {
            logger.info(`\nConnexion à ${peerAddress}...`);
            const ma = multiaddr(peerAddress);
            const connection = await node.libp2p.dial(ma);
            logger.prod('✅ Connecté avec succès');
        } catch (error) {
            logger.error('Erreur de connexion:', error.message);
        }
    }

    // --- MISE EN PLACE DU SERVEUR API ---
    const app = express();
    app.use(cors());
    app.use(express.json());
    const PORT = process.env.PORT || 3001;

    app.get('/status', (req, res) => {
      const connections = node.libp2p.getConnections();
      res.json({
        peerId: node.libp2p.peerId.toString(),
        connectionCount: connections.length,
        addresses: node.libp2p.getMultiaddrs().map(a => a.toString())
      });
    });

    app.post('/wallets', async (req, res) => {
        try {
            const { name, country, city, idNumber, type } = req.body;
            if (!name || !country || !city || !idNumber || !type) {
            return res.status(400).json({ message: 'Missing required fields' });
            }

            const walletFileName = `${name.replace(/\s/g, '_')}.json`;
            const filePath = path.join('data', walletFileName);

            const newWallet = await createWallet(filePath, {
                name,
                country,
                city,
                nationalId: idNumber,
                accountType: type
            });

            // We need to derive the peerId for the new wallet to return it
            const privateKey = await keys.unmarshalPrivateKey(Buffer.from(newWallet.privateKey, 'base64'));
            const peerId = await createFromPubKey(privateKey.public);

            const newWalletResponse = {
                ...newWallet,
                id: newWallet.created,
                address: peerId.toString(), // Use the real peerId as the address
                balance: { main: 0, vectors: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
            }

            res.status(201).json(newWalletResponse);
        } catch (error) {
            logger.error('Error creating wallet:', error);
            res.status(500).json({ message: 'Failed to create wallet' });
        }
    });

    app.get('/wallets', async (req, res) => {
        try {
            const files = await fs.readdir('data');
            const wallets = await Promise.all(files
                .filter(file => file.endsWith('.json')) // Filter out non-wallet files like node_wallet.dat
                .map(async (file) => {
                    const filePath = path.join('data', file);
                    const fileContent = await fs.readFile(filePath, 'utf-8');
                    const walletData = JSON.parse(fileContent);
                    const privateKey = await keys.unmarshalPrivateKey(Buffer.from(walletData.privateKey, 'base64'));
                    const peerId = await createFromPubKey(privateKey.public);
                    return {
                        ...walletData,
                        id: walletData.created,
                        name: walletData.name || file.replace('.json', '').replace(/_/g, ' '),
                        address: peerId.toString(),
                        balance: { main: 0, vectors: [0, 0, 0, 0, 0, 0, 0, 0, 0] }
                    };
            }));
            res.json(wallets);
        } catch (error) {
            logger.error('Error reading wallets directory:', error);
            res.status(500).json({ message: 'Failed to read wallets directory' });
        }
    });

    app.post('/wallets/import', async (req, res) => {
        try {
            const { walletData, name } = req.body;
            if (!walletData || !name) {
            return res.status(400).json({ message: 'Missing required fields' });
            }

            const parsedWallet = JSON.parse(walletData);
            if (!parsedWallet.version || !parsedWallet.privateKey) {
            return res.status(400).json({ message: 'Invalid wallet file' });
            }

            const walletFileName = `${name.replace(/\s/g, '_')}.json`;
            const filePath = path.join('data', walletFileName);

            await fs.writeFile(filePath, walletData, 'utf8');

            res.status(200).json({ message: 'Wallet imported successfully' });
        } catch (error) {
            logger.error('Error importing wallet:', error);
            res.status(500).json({ message: 'Failed to import wallet' });
        }
    });

    app.listen(PORT, () => {
      logger.info(`API server is running on http://localhost:${PORT}`);
    });
    // --- FIN DU SERVEUR API ---


    // Gestion de la fermeture propre
    process.on('SIGINT', async () => {
      logger.info('\nFermeture du nœud et du serveur...');
      await node.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Erreur principale:', error);
    logger.debug('Stack trace complet:', error);
    process.exit(1);
  }
}

// Lancement de l'application
main();
