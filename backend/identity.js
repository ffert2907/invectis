import { createHmac, createHash } from 'crypto';
import { PEPPER } from './config.js';

/**
 * Normalizes a string by converting to NFC, lowercasing, trimming,
 * and collapsing internal whitespace.
 * @param {string} str - The input string.
 * @returns {string} The normalized string.
 */
function normalizeString(str) {
  if (!str) return '';
  return str
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Generates a unique, privacy-preserving nullifier for an individual.
 *
 * @param {object} pii - The personal identifiable information.
 * @param {string} pii.givenName - The user's first name.
 * @param {string} pii.familyName - The user's last name.
 * @param {string} pii.dateOfBirth - The user's date of birth (YYYY-MM-DD).
 * @param {string} pii.countryOfBirth - The user's country of birth (ISO-3166-1 alpha-2).
 * @param {string} pii.cityOfBirth - The user's city of birth.
 * @returns {string} The hex-encoded nullifier.
 */
export function generateNullifier({ givenName, familyName, dateOfBirth, countryOfBirth, cityOfBirth }) {
  // 1. Normalize all inputs
  const normalizedGivenName = normalizeString(givenName);
  const normalizedFamilyName = normalizeString(familyName);
  const normalizedDateOfBirth = normalizeString(dateOfBirth);
  const normalizedCountryOfBirth = normalizeString(countryOfBirth);
  const normalizedCityOfBirth = normalizeString(cityOfBirth);

  // 2. Concatenate with a fixed delimiter to form the canonical ID
  const canonID = [
    normalizedGivenName,
    normalizedFamilyName,
    normalizedDateOfBirth,
    normalizedCountryOfBirth,
    normalizedCityOfBirth,
  ].join('|');

  // 3. Compute the commitment using HMAC-SHA256 with the secret pepper
  const commit = createHmac('sha256', PEPPER)
    .update(canonID)
    .digest('hex');

  // 4. Derive the public nullifier using SHA256
  const nullifier = createHash('sha256')
    .update('personhood' + commit)
    .digest('hex');

  return nullifier;
}
