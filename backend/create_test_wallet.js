import { createWallet } from './wallet.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    try {
        const dataDir = path.join(__dirname, 'data');
        await mkdir(dataDir, { recursive: true });
        const walletPath = path.join(dataDir, 'test_wallet.dat');

        console.log(`Creating wallet at: ${walletPath}`);

        const walletDetails = {
            accountType: 'individual',
            givenName: 'Test',
            familyName: 'User',
            dateOfBirth: '1990-01-01',
            countryOfBirth: 'XX',
            cityOfBirth: 'Testville'
        };

        await createWallet(walletPath, walletDetails);
        console.log('Wallet created successfully.');
    } catch (error) {
        console.error('Failed to create test wallet:', error);
        process.exit(1);
    }
}

main();
