import { keys } from '@libp2p/crypto';
import { TextEncoder } from 'util';
import { logger } from './config.js';

/**
 * Creates a canonical string representation of a JSON object.
 * Keys are sorted alphabetically to ensure a consistent output.
 * @param {object} object - The object to canonicalize.
 * @returns {string} - A deterministic string representation of the object.
 */
function canonicalize(object) {
    const sortedObject = {};
    Object.keys(object).sort().forEach(key => {
        sortedObject[key] = object[key];
    });
    return JSON.stringify(sortedObject);
}

/**
 * Verifies a wallet-node attestation.
 *
 * @param {object} signedAttestation - The signed attestation object containing the attestation and signature.
 * @param {object} signedAttestation.attestation - The attestation object.
 * @param {string} signedAttestation.signature - The base64-encoded signature.
 * @returns {Promise<boolean>} - True if the attestation is valid, false otherwise.
 */
export async function verifyAttestation({ attestation, signature }) {
    try {
        const { walletPubKey, issuedAt, expiresAt } = attestation;

        if (!walletPubKey || !issuedAt || !expiresAt) {
            logger.warn('Verification: Attestation is missing required fields (walletPubKey, issuedAt, expiresAt).');
            return false;
        }

        // 1. Verify timestamps
        const now = new Date();
        if (new Date(issuedAt) > now) {
            logger.warn('Verification: Attestation was issued in the future.');
            return false;
        }
        if (new Date(expiresAt) < now) {
            logger.warn('Verification: Attestation has expired.');
            return false;
        }

        // 2. Verify signature
        const { keys } = await import('@libp2p/crypto');
        const publicKeyBytes = Buffer.from(walletPubKey, 'base64');
        const publicKey = keys.publicKeyFromRaw('Ed25519', publicKeyBytes);

        const payloadToVerify = canonicalize(attestation);
        const signatureBytes = Buffer.from(signature, 'base64');

        const isValid = await publicKey.verify(new TextEncoder().encode(payloadToVerify), signatureBytes);

        if (!isValid) {
            logger.warn('Verification: Attestation signature is invalid.');
            return false;
        }

        logger.info('Verification: Attestation is valid.');
        return true;
    } catch (error) {
        logger.error('Verification: An error occurred during attestation verification:', error);
        return false;
    }
}
