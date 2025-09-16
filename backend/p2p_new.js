import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { createHelia } from 'helia'
import { DatastoreWrapper } from './datastore_wrapper.js'
import { keys } from '@libp2p/crypto'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
import { pipe } from 'it-pipe'
import { fromString as uint8ArrayFromString, toString as uint8ArrayToString } from 'uint8arrays'
import { logger } from './config.js'
import { circuitRelayTransport, circuitRelayServer } from '@libp2p/circuit-relay-v2'
import { kadDHT } from '@libp2p/kad-dht'
import { bootstrap } from '@libp2p/bootstrap'
import { ping } from '@libp2p/ping'
import { CID } from 'multiformats/cid'
import { RateLimiter, createConnectionGater } from './security.js'

// A list of bootstrap nodes to connect to.
// These are public nodes provided by the libp2p community.
const BOOTSTRAP_NODES = [
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt'
];

/**
 * Creates and configures a P2P node with Helia, WebSockets support, and a decoupled identity.
 * The node generates its own ephemeral PeerID and exposes a method to serve a wallet-signed attestation.
 * @param {string} datastorePath - The path to the local database directory.
 * @param {import('./security.js').ReputationManager} reputationManager - The reputation manager instance.
 * @param {object} options - Additional options for node behavior.
 * @param {function(CID): Promise<void>} options.onPinRequest - Callback to handle a pin request from a peer.
 * @returns {Promise<import('helia').Helia & { setAttestation: (attestation: object) => void, privateKey: import('@libp2p/interface-keys').PrivateKey }>} - A configured Helia instance with additional properties.
 */
export async function createNode(datastorePath, reputationManager, options = {}) {
  // This variable will hold the signed attestation and is captured in the handler's closure.
  let currentAttestation = null;
  let currentHeadProvider = () => null; // Default provider returns null
  const publicKeyCache = new Map(); // A simple in-memory cache for public keys
  const protocolRateLimiter = new RateLimiter(5, 10); // 5 req/sec, burst 10

  // 1. Generate an ephemeral identity for this node session.
  const nodeKey = await keys.generateKeyPair('Ed25519');
  const peerId = await peerIdFromPrivateKey(nodeKey);
  logger.info(`P2P: Generated ephemeral node PeerId: ${peerId.toString()}`);

  // Configure the local database for storage
  const datastore = new DatastoreWrapper(datastorePath)

  // Configure libp2p with WebSockets, DHT, and circuit relay
  const libp2pConfig = {
    peerId,
    addresses: {
      listen: [
        '/ip4/0.0.0.0/tcp/0',
        '/ip4/0.0.0.0/tcp/0/ws'
      ]
    },
    transports: [
      tcp(),
      webSockets()
      // DIagnostic: Temporarily disable circuit relay
      // circuitRelayTransport({
      //   discoverRelays: 2 // Attempt to discover 2 relays
      // })
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub({
        allowPublishToZeroPeers: true,
        msgIdFn: (msg) => {
          return new TextEncoder().encode(msg.topic + msg.data)
        },
        emitSelf: false,
        debugName: 'gossipsub-debug'
      }),
      // Diagnostic: Temporarily disable non-essential services
      // dht: kadDHT({
      //   protocol: '/ipfs/kad/1.0.0',
      //   clientMode: false // Run in server mode to participate in the DHT
      // }),
      // relay: circuitRelayServer({
      //   reservations: {
      //     maxReservations: 15,
      //     hopTimeout: 30 * 1000
      //   }
      // }),
      // ping: ping()
    },
    peerDiscovery: [
        bootstrap({
          list: process.env.NODE_ENV === 'test' ? [] : BOOTSTRAP_NODES,
          timeout: 1000, // in ms,
        })
    ],
    connectionGater: createConnectionGater(reputationManager),
    connectionManager: {
      minConnections: 0,
      maxConnections: 100,
      dialTimeout: 30000,
      inboundUpgradeTimeout: 30000
    }
  }

  const libp2p = await createLibp2p(libp2pConfig)

  // 2. Set up protocol handlers
  // Attestation handler
  await libp2p.handle('/app/attest/1.0.0', ({ stream, connection }) => {
    const remotePeerId = connection.remotePeer.toString();
    if (!protocolRateLimiter.isAllowed(remotePeerId)) {
      logger.warn(`P2P: Rate limit exceeded for peer ${remotePeerId} on /app/attest/1.0.0. Aborting stream.`);
      reputationManager.rateLimitExceeded(remotePeerId);
      return stream.abort(new Error('Rate limit exceeded'));
    }

    if (currentAttestation) {
      logger.info(`P2P: Serving attestation to requesting peer.`);
      pipe(
        [uint8ArrayFromString(JSON.stringify(currentAttestation))],
        stream.sink
      ).catch(err => {
        logger.error('P2P: Error piping attestation to stream:', err);
      });
    } else {
      logger.warn('P2P: No attestation available to serve, closing stream.');
      stream.close();
    }
  });

  // Replication protocol handler
  await libp2p.handle('/app/replicate/1.0.0', async ({ stream, connection }) => {
    const remotePeerId = connection.remotePeer.toString();
    if (!protocolRateLimiter.isAllowed(remotePeerId)) {
      logger.warn(`P2P: Rate limit exceeded for peer ${remotePeerId} on /app/replicate/1.0.0. Aborting stream.`);
      reputationManager.rateLimitExceeded(remotePeerId);
      return stream.abort(new Error('Rate limit exceeded'));
    }

    logger.info(`P2P: Received replication request from ${remotePeerId}`);
    try {
      const cidString = await pipe(
        stream.source,
        async function (source) {
          const chunks = [];
          for await (const chunk of source) {
            chunks.push(chunk.subarray());
          }
          return uint8ArrayToString(Buffer.concat(chunks));
        }
      );

      if (cidString && options.onPinRequest) {
        const cid = CID.parse(cidString);
        logger.info(`P2P: Peer requested pinning of ${cid.toString()}`);
        await options.onPinRequest(cid, connection.remotePeer);
        logger.info(`P2P: Successfully processed pin request for ${cid.toString()}`);
      }
      stream.close();
    } catch (err) {
      logger.error('P2P: Error handling replication request:', err);
      stream.abort(err);
    }
  });

  // Head announcement handler
  await libp2p.handle('/app/head/1.0.0', ({ stream, connection }) => {
    const remotePeerId = connection.remotePeer.toString();
    if (!protocolRateLimiter.isAllowed(remotePeerId)) {
      logger.warn(`P2P: Rate limit exceeded for peer ${remotePeerId} on /app/head/1.0.0. Aborting stream.`);
      reputationManager.rateLimitExceeded(remotePeerId);
      return stream.abort(new Error('Rate limit exceeded'));
    }

    const headCid = currentHeadProvider();
    if (headCid) {
      logger.info(`P2P: Serving head ${headCid.toString()} to requesting peer.`);
      pipe(
        [uint8ArrayFromString(headCid.toString())], // Send the CID as a string
        stream.sink
      ).catch(err => {
        logger.error('P2P: Error piping head to stream:', err);
      });
    } else {
      logger.warn('P2P: No head available to serve, closing stream.');
      stream.close();
    }
  });

  // Create the Helia instance from libp2p
  const helia = await createHelia({
    libp2p,
    datastore,
    start: false // We will start it manually
  })

  // 3. Add methods to the Helia instance for core logic interaction
  helia.setAttestation = (newAttestation) => {
    logger.info('P2P: Node attestation has been received and is now available.');
    currentAttestation = newAttestation;
  };

  helia.setHeadProvider = (provider) => {
    logger.info('P2P: Head provider has been set.');
    currentHeadProvider = provider;
  }

  helia.getHeadFrom = async (peerId) => {
    logger.info(`P2P: Requesting head from peer ${peerId.toString()}`);
    try {
      const stream = await libp2p.dialProtocol(peerId, '/app/head/1.0.0');
      const cidString = await pipe(
        stream.source,
        async function (source) {
          const chunks = [];
          for await (const chunk of source) {
            chunks.push(chunk.subarray());
          }
          return uint8ArrayToString(Buffer.concat(chunks));
        }
      );
      stream.close();
      if (cidString) {
        logger.info(`P2P: Received head ${cidString} from peer ${peerId.toString()}`);
        return CID.parse(cidString);
      }
      return null;
    } catch (err) {
      logger.error(`P2P: Could not get head from peer ${peerId.toString()}:`, err);
      return null;
    }
  };

  // Attach the node's private key to the returned instance.
  // This is useful if the key needs to be persisted.
  helia.privateKey = nodeKey;

  helia.getPublicKey = async (peerId) => {
    const peerIdString = peerId.toString();
    if (publicKeyCache.has(peerIdString)) {
      return publicKeyCache.get(peerIdString);
    }

    logger.info(`P2P: Requesting attestation from peer ${peerIdString} to get public key...`);
    try {
      const stream = await libp2p.dialProtocol(peerId, '/app/attest/1.0.0');
      const attestationString = await pipe(
        stream.source,
        async function (source) {
          const chunks = [];
          for await (const chunk of source) {
            chunks.push(chunk.subarray());
          }
          return uint8ArrayToString(Buffer.concat(chunks));
        }
      );
      stream.close();

      if (attestationString) {
        const { attestation } = JSON.parse(attestationString);
        if (attestation && attestation.walletEncryptionPubKey) {
          const publicKey = Buffer.from(attestation.walletEncryptionPubKey, 'base64');
          publicKeyCache.set(peerIdString, publicKey);
          logger.info(`P2P: Successfully retrieved and cached public key for ${peerIdString}`);
          return publicKey;
        }
      }
      return null;
    } catch (err) {
      logger.error(`P2P: Could not get public key from peer ${peerIdString}:`, err);
      return null;
    }
  };

  return helia;
}
