import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { createHelia } from 'helia'
import { createBlockstore } from './adapters/storage.js'
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

const BOOTSTRAP_NODES = [
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt'
];

export async function createNode(datastorePath, reputationManager, options = {}) {
  let currentAttestation = null;
  let currentHeadProvider = () => null;
  const publicKeyCache = new Map();
  const protocolRateLimiter = new RateLimiter(5, 10);

  const nodeKey = await keys.generateKeyPair('Ed25519');
  const peerId = await peerIdFromPrivateKey(nodeKey);
  logger.info(`P2P: Generated ephemeral node PeerId: ${peerId.toString()}`);

  const datastore = await createBlockstore(datastorePath);

  const libp2pConfig = {
    peerId,
    addresses: { listen: ['/ip4/0.0.0.0/tcp/0', '/ip4/0.0.0.0/tcp/0/ws'] },
    transports: [tcp(), webSockets(), circuitRelayTransport({ discoverRelays: 2 })],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroPeers: true }),
      dht: kadDHT({ clientMode: false }),
      relay: circuitRelayServer({ reservations: { maxReservations: 15 } }),
      ping: ping()
    },
    peerDiscovery: process.env.NODE_ENV === 'test'
      ? []
      : [bootstrap({ list: BOOTSTRAP_NODES, timeout: 2000 })],
    connectionGater: createConnectionGater(reputationManager)
  };

  const libp2p = await createLibp2p(libp2pConfig);

  // Protocol Handlers
  libp2p.handle('/app/attest/1.0.0', ({ stream, connection }) => {
    if (!protocolRateLimiter.isAllowed(connection.remotePeer.toString())) {
      return stream.abort(new Error('Rate limit exceeded'));
    }
    if (currentAttestation) {
      pipe([uint8ArrayFromString(JSON.stringify(currentAttestation))], stream.sink).catch(err => logger.error('P2P Attestation Pipe Error:', err));
    } else {
      stream.close();
    }
  });

  libp2p.handle('/app/head/1.0.0', ({ stream, connection }) => {
    if (!protocolRateLimiter.isAllowed(connection.remotePeer.toString())) {
        return stream.abort(new Error('Rate limit exceeded'));
    }
    const headCid = currentHeadProvider();
    if (headCid) {
        pipe([uint8ArrayFromString(headCid.toString())], stream.sink).catch(err => logger.error('P2P Head Pipe Error:', err));
    } else {
        stream.close();
    }
  });

  const helia = await createHelia({ libp2p, datastore, start: false });

  helia.setAttestation = (newAttestation) => { currentAttestation = newAttestation; };
  helia.setHeadProvider = (provider) => { currentHeadProvider = provider; };
  helia.privateKey = nodeKey;

  helia.getPublicKey = async (peerId) => {
    const peerIdString = peerId.toString();
    if (publicKeyCache.has(peerIdString)) return publicKeyCache.get(peerIdString);
    try {
      const stream = await libp2p.dialProtocol(peerId, '/app/attest/1.0.0');
      const attestationString = await pipe(stream.source, async (source) => {
        const chunks = [];
        for await (const chunk of source) { chunks.push(chunk.subarray()); }
        return uint8ArrayToString(Buffer.concat(chunks));
      });
      stream.close();
      if (attestationString) {
        const { attestation } = JSON.parse(attestationString);
        if (attestation && attestation.walletEncryptionPubKey) {
          const publicKey = Buffer.from(attestation.walletEncryptionPubKey, 'base64');
          publicKeyCache.set(peerIdString, publicKey);
          return publicKey;
        }
      }
    } catch (err) {
      logger.error(`Could not get public key from ${peerIdString}:`, err);
    }
    return null;
  };

  return helia;
}
