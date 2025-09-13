import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { createHelia } from 'helia'
import { MemoryDatastore } from 'datastore-core'
import path from 'path'
import { keys } from '@libp2p/crypto'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
import { pipe } from 'it-pipe'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { logger } from './config.js'

/**
 * Creates and configures a P2P node with Helia, WebSockets support, and a decoupled identity.
 * The node generates its own ephemeral PeerID and exposes a method to serve a wallet-signed attestation.
 * @param {string} datastorePath - The path to the local database directory.
 * @returns {Promise<import('helia').Helia & { setAttestation: (attestation: object) => void, privateKey: import('@libp2p/interface-keys').PrivateKey }>} - A configured Helia instance with additional properties.
 */
export async function createNode(datastorePath) {
  // This variable will hold the signed attestation and is captured in the handler's closure.
  let currentAttestation = null;

  // 1. Generate an ephemeral identity for this node session.
  const nodeKey = await keys.generateKeyPair('Ed25519');
  const peerId = await peerIdFromPrivateKey(nodeKey);
  logger.info(`P2P: Generated ephemeral node PeerId: ${peerId.toString()}`);

  // Configure the local database for storage
  const datastore = new MemoryDatastore()

  // Configure libp2p with WebSockets
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
      })
    },
    connectionGater: {
      denyDialMultiaddr: () => false
    },
    connectionManager: {
      minConnections: 0,
      maxConnections: 100,
      dialTimeout: 30000,
      inboundUpgradeTimeout: 30000
    }
  }

  const libp2p = await createLibp2p(libp2pConfig)

  // 2. Set up the attestation protocol handler
  await libp2p.handle('/app/attest/1.0.0', ({ stream }) => {
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

  // Create the Helia instance from libp2p
  const helia = await createHelia({
    libp2p,
    datastore,
    start: false // We will start it manually
  })

  // 3. Add a method to the Helia instance to update the attestation post-creation
  helia.setAttestation = (newAttestation) => {
    logger.info('P2P: Node attestation has been received and is now available.');
    currentAttestation = newAttestation;
  };

  // Attach the node's private key to the returned instance.
  // This is useful if the key needs to be persisted.
  helia.privateKey = nodeKey;

  return helia;
}



/*import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
// import { createHelia } from 'helia'
*/
/**
 * Crée et configure un nœud P2P avec Helia et support WebSockets
 * @param {PeerId} peerId - Identité du nœud
 * @returns {Promise<Helia>} - Instance Helia configurée
 */
 /*
export async function createNode(peerId) {
  console.log('🔍 DEBUG: Configuration du nœud libp2p...')
  console.log('  - PeerId:', peerId.toString())
  
  // Configuration de libp2p avec WebSockets
  const libp2pConfig = {
    peerId,
    addresses: {
      listen: [
        // '/ip4/0.0.0.0/tcp/0',
        '/ip4/0.0.0.0/tcp/0/ws'
      ]
    },
    transports: [
      tcp(),
      webSockets()
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub({
        allowPublishToZeroPeers: true,
        msgIdFn: (msg) => {
          return new TextEncoder().encode(msg.topic + msg.data)
        },
        emitSelf: false,
        // Ajout de logs pour gossipsub
        debugName: 'gossipsub-debug'
      })
    },
    connectionGater: {
      denyDialMultiaddr: () => false
    },
    connectionManager: {
      minConnections: 0,
      maxConnections: 100,
      // Délais plus longs pour le debug
      dialTimeout: 30000,
      inboundUpgradeTimeout: 30000
    }
  }

  console.log('🔍 DEBUG: Création de l\'instance libp2p...')
  const libp2p = await createLibp2p(libp2pConfig)

  // Ajout d'événements pour le debug
  libp2p.addEventListener('peer:connect', (evt) => {
    console.log('🔍 DEBUG: Peer connecté:', evt.detail.toString())
  })

  libp2p.addEventListener('peer:disconnect', (evt) => {
    console.log('🔍 DEBUG: Peer déconnecté:', evt.detail.toString())
  })

  libp2p.addEventListener('peer:discovery', (evt) => {
    console.log('🔍 DEBUG: Peer découvert:', evt.detail.id.toString())
  })

  //console.log('🔍 DEBUG: Création de l\'instance Helia...')
  // Création de l'instance Helia à partir de libp2p
  //const helia = await createHelia({ 
  //  libp2p,
    // Configuration additionnelle pour Helia
  //  start: false // On démarre manuellement
  //})
  
  
  
  console.log('🔍 DEBUG: Configuration libp2p terminée, retourne l\'instance brute.')
  return libp2p  

  console.log('🔍 DEBUG: Configuration terminée')
  console.log('  - Transports configurés:', ['tcp', 'websockets'])
  console.log('  - Chiffrement:', ['noise'])
  console.log('  - Multiplexeurs:', ['yamux'])
  console.log('  - Services:', ['identify', 'pubsub/gossipsub'])

  return helia
}
*/