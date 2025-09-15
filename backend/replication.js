import { logger } from './config.js';
import { CID } from 'multiformats/cid';
import { pipe } from 'it-pipe';
import { fromString as uint8ArrayFromString } from 'uint8arrays';

const REPLICATION_FACTOR = 3; // Target number of replicas for each pinned CID
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Manages the replication of pinned CIDs to ensure they are stored
 * across a sufficient number of peers in the network.
 */
export class ReplicationManager {
  /**
   * @param {object} options
   * @param {import('libp2p').Libp2p} options.libp2p - The libp2p instance.
   * @param {import('./storage.js').PinManager} options.pinManager - The pin manager instance.
   */
  constructor({ libp2p, pinManager }) {
    this.libp2p = libp2p;
    this.pinManager = pinManager;
    this.intervalId = null;
  }

  /**
   * Starts the replication manager's periodic checks.
   */
  start() {
    if (this.intervalId) {
      logger.warn('ReplicationManager: Already started.');
      return;
    }
    logger.info(`ReplicationManager: Starting periodic replication check every ${CHECK_INTERVAL_MS / 1000} seconds.`);
    this.intervalId = setInterval(() => this.checkReplication(), CHECK_INTERVAL_MS);
    // Run a check soon after startup
    setTimeout(() => this.checkReplication(), 5000);
  }

  /**
   * Stops the replication manager's periodic checks.
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('ReplicationManager: Stopped periodic replication check.');
    }
  }

  /**
   * Checks the replication status of all pinned CIDs and triggers replication if necessary.
   */
  async checkReplication() {
    logger.info('ReplicationManager: Starting replication check for pinned CIDs...');
    const pinnedCids = await this.pinManager.getAllPins();

    if (pinnedCids.length === 0) {
      logger.info('ReplicationManager: No CIDs are pinned. Nothing to check.');
      return;
    }

    logger.info(`ReplicationManager: Checking ${pinnedCids.length} pinned CIDs.`);

    for (const cid of pinnedCids) {
      try {
        const providers = [];
        // The findProviders call can be slow, so we do it sequentially for now.
        for await (const provider of this.libp2p.contentRouting.findProviders(cid, { timeout: 10000 })) {
            providers.push(provider);
        }

        logger.info(`ReplicationManager: Found ${providers.length} provider(s) for ${cid.toString()}`);

        if (providers.length < REPLICATION_FACTOR) {
          await this.triggerReplication(cid, providers);
        }
      } catch (err) {
        logger.error(`ReplicationManager: Error finding providers for ${cid.toString()}:`, err);
      }
    }
    logger.info('ReplicationManager: Replication check finished.');
  }

  /**
   * Attempts to replicate a CID to other peers.
   * @param {CID} cid - The CID to replicate.
   * @param {import('@libp2p/interface-peer-info').PeerInfo[]} currentProviders - The list of peers already providing the CID.
   */
  async triggerReplication(cid, currentProviders) {
    const neededReplicas = REPLICATION_FACTOR - currentProviders.length;
    logger.info(`ReplicationManager: Attempting to find ${neededReplicas} new peer(s) to replicate ${cid.toString()}`);

    const connectedPeers = this.libp2p.getPeers();
    const providerIds = new Set(currentProviders.map(p => p.id.toString()));
    const selfId = this.libp2p.peerId.toString();
    providerIds.add(selfId); // Don't try to replicate to self

    // Find candidate peers that are not already providers
    const candidates = connectedPeers.filter(p => !providerIds.has(p.toString()));

    if (candidates.length === 0) {
      logger.warn(`ReplicationManager: No other connected peers available to replicate ${cid.toString()}`);
      return;
    }

    // Select random candidates to ask for replication
    const selectedPeers = candidates.sort(() => 0.5 - Math.random()).slice(0, neededReplicas);

    for (const peer of selectedPeers) {
      logger.info(`ReplicationManager: Asking peer ${peer.toString()} to replicate ${cid.toString()}`);
      try {
        const stream = await this.libp2p.dialProtocol(peer, '/app/replicate/1.0.0', { timeout: 10000 });
        await pipe(
          [uint8ArrayFromString(cid.toString())],
          stream.sink
        );
        stream.close();
        logger.info(`ReplicationManager: Successfully sent replication request to ${peer.toString()}`);
      } catch (err) {
        logger.error(`ReplicationManager: Failed to send replication request to ${peer.toString()}:`, err);
      }
    }
  }
}
