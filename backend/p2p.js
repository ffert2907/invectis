import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { createHelia } from 'helia'

/**
 * Crée et configure un nœud P2P avec Helia et support WebSockets
 * @param {import('@libp2p/interface-keys').PrivateKey} privateKey - La clé privée du noeud
 * @returns {Promise<Helia>} - Instance Helia configurée
 */
export async function createNode(privateKey) {
  console.log('🔍 DEBUG: Configuration du nœud libp2p...')
  
  // Configuration de libp2p avec WebSockets
  const libp2pConfig = {
    privateKey,
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

  console.log('🔍 DEBUG: Création de l\'instance Helia...')
  // Création de l'instance Helia à partir de libp2p
  const helia = await createHelia({ 
    libp2p,
    // Configuration additionnelle pour Helia
    start: false // On démarre manuellement
  })

  console.log('🔍 DEBUG: Configuration terminée')
  console.log('  - Transports configurés:', ['tcp', 'websockets'])
  console.log('  - Chiffrement:', ['noise'])
  console.log('  - Multiplexeurs:', ['yamux'])
  console.log('  - Services:', ['identify', 'pubsub/gossipsub'])

  return helia
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