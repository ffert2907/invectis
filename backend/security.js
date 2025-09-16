import { logger } from './config.js';

const DEFAULT_RATE_LIMIT_RPS = 1; // Requests per second
const DEFAULT_RATE_LIMIT_BURST = 5; // Burst allowance
const MIN_REPUTATION_SCORE = -10;
const INITIAL_REPUTATION_SCORE = 0;
const REPUTATION_CHANGE_VALID_TX = 1;
const REPUTATION_CHANGE_INVALID_TX = -5;
const REPUTATION_CHANGE_RATE_LIMIT = -2;

/**
 * A simple token-bucket rate limiter.
 */
export class RateLimiter {
  constructor(requestsPerSecond = DEFAULT_RATE_LIMIT_RPS, burst = DEFAULT_RATE_LIMIT_BURST) {
    this.requestsPerSecond = requestsPerSecond;
    this.burst = burst;
    this.peers = new Map(); // peerId -> { tokens, lastAccess }
  }

  /**
   * Checks if a peer is allowed to make a request.
   * @param {string} peerId - The string representation of the peer's ID.
   * @returns {boolean} - True if the request is allowed, false otherwise.
   */
  isAllowed(peerId) {
    if (!this.peers.has(peerId)) {
      this.peers.set(peerId, { tokens: this.burst, lastAccess: Date.now() });
    }

    const peerData = this.peers.get(peerId);
    const now = Date.now();
    const timeElapsed = now - peerData.lastAccess;

    // Add tokens based on elapsed time
    peerData.tokens += timeElapsed * (this.requestsPerSecond / 1000);
    peerData.lastAccess = now;

    // Clamp tokens to the burst limit
    if (peerData.tokens > this.burst) {
      peerData.tokens = this.burst;
    }

    // Check if there are enough tokens
    if (peerData.tokens >= 1) {
      peerData.tokens -= 1;
      return true;
    }

    return false;
  }
}

/**
 * Manages reputation scores for peers.
 */
export class ReputationManager {
  constructor() {
    this.peers = new Map(); // peerId -> score
  }

  /**
   * Gets the reputation score for a peer.
   * @param {string} peerId - The string representation of the peer's ID.
   * @returns {number} - The peer's reputation score.
   */
  getScore(peerId) {
    return this.peers.get(peerId) ?? INITIAL_REPUTATION_SCORE;
  }

  /**
   * Adjusts a peer's reputation score.
   * @param {string} peerId - The string representation of the peer's ID.
   * @param {number} change - The amount to change the score by (can be negative).
   */
  adjustScore(peerId, change) {
    const currentScore = this.getScore(peerId);
    const newScore = currentScore + change;
    this.peers.set(peerId, newScore);
    logger.info(`Reputation for ${peerId} changed by ${change}. New score: ${newScore}`);
  }

  /**
   * A convenience method for valid transactions.
   * @param {string} peerId
   */
  validTransaction(peerId) {
    this.adjustScore(peerId, REPUTATION_CHANGE_VALID_TX);
  }

  /**
   * A convenience method for invalid transactions.
   * @param {string} peerId
   */
  invalidTransaction(peerId) {
    this.adjustScore(peerId, REPUTATION_CHANGE_INVALID_TX);
  }

    /**
   * A convenience method for when a peer hits a rate limit.
   * @param {string} peerId
   */
  rateLimitExceeded(peerId) {
    this.adjustScore(peerId, REPUTATION_CHANGE_RATE_LIMIT);
  }
}

/**
 * Creates a libp2p connection gater based on reputation.
 * @param {ReputationManager} reputationManager - An instance of the ReputationManager.
 * @returns {object} - A libp2p connection gater configuration object.
 */
export function createConnectionGater(reputationManager) {
  return {
    denyDialMultiaddr: () => false, // We don't deny dialing out based on address
    denyDialPeer: async (peerId) => {
        const score = reputationManager.getScore(peerId.toString());
        if (score < MIN_REPUTATION_SCORE) {
            logger.warn(`Denying dial to peer ${peerId.toString()} due to low reputation score: ${score}`);
            return true;
        }
        return false;
    },
    denyInboundConnection: async () => {
        // Allow all raw inbound connections, reputation is checked after encryption handshake
        return false;
    },
    denyInboundEncryptedConnection: async () => {
        // Allow all encrypted connections for now to fix connection bug.
        // A more sophisticated gater could check reputation here.
        return false;
    },
    denyInboundUpgradedConnection: async () => {
        // Allow all upgraded connections for now.
        return false;
    }
  };
}
