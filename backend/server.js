import express from 'express';
import cors from 'cors';
import { createWallet } from './wallet.js';
import path from 'path';
import { logger } from './config.js';
import fs from 'fs/promises';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

app.post('/wallets', async (req, res) => {
  try {
    const { name, country, city, idNumber, type } = req.body;
    if (!name || !country || !city || !idNumber || !type) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const walletFileName = `${name.replace(/\s/g, '_')}.json`;
    const filePath = path.join('data', walletFileName);

    const wallet = await createWallet(filePath, {
      country,
      city,
      nationalId: idNumber,
      accountType: type
    });

    const newWalletResponse = {
        id: Date.now(),
        name,
        address: '...generating...', // Placeholder address
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
    res.json(files);
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

    // Basic validation
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
  logger.info(`Backend server is running on http://localhost:${PORT}`);
});
