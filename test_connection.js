#!/usr/bin/env node
/**
 * Script de test pour diagnostiquer les problèmes de connexion P2P
 * Usage: node test-connection.js <multiaddr>
 */

import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import { multiaddr } from '@multiformats/multiaddr'

const targetAddress = process.argv[2]

if (!targetAddress) {
  console.log('Usage: node test-connection.js <multiaddr>')
  console.log('Exemple: node test-connection.js /ip4/127.0.0.1/tcp/12345/p2p/12D3Koo...')
  process.exit(1)
}

async function testConnection() {
  console.log('🧪 Test de connexion P2P')
  console.log('Adresse cible:', targetAddress)
  
  // Création d'une identité temporaire
  const peerId = await createEd25519PeerId()
  console.log('Identité temporaire créée:', peerId.toString())

  // Configuration minimale
  const libp2p = await createLibp2p({
    peerId,
    addresses: {
      listen: []  // Pas d'écoute pour ce test
    },
    transports: [
      tcp(),
      webSockets()
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify()
    }
  })

  await libp2p.start()
  console.log('Node de test démarré')

  try {
    // Analyse de l'adresse
    const ma = multiaddr(targetAddress)
    console.log('\n📋 Analyse de l\'adresse:')
    console.log('  Protocoles:', ma.protoNames())
    console.log('  PeerId:', ma.getPeerId())
    
    // Détection du type de transport
    const isWebSocket = targetAddress.includes('/ws')
    const isTcp = !isWebSocket
    
    console.log('  Type détecté:', isWebSocket ? 'WebSocket' : 'TCP')

    // Tentative de connexion
    console.log('\n🔌 Tentative de connexion...')
    
    const startTime = Date.now()
    const connection = await libp2p.dial(ma)
    const endTime = Date.now()
    
    console.log('✅ Connexion réussie!')
    console.log('  Temps de connexion:', endTime - startTime, 'ms')
    console.log('  Peer distant:', connection.remotePeer.toString())
    console.log('  Adresse distante:', connection.remoteAddr.toString())
    console.log('  Status:', connection.status)
    
    // Test des protocoles
    console.log('\n🔍 Test des protocoles...')
    try {
      const protocols = await connection.newStream(['/ipfs/id/1.0.0'])
      console.log('✅ Protocole identify supporté')
      await protocols.close()
    } catch (err) {
      console.log('❌ Protocole identify non supporté:', err.message)
    }

    // Fermeture propre
    await connection.close()
    console.log('✅ Connexion fermée proprement')

  } catch (error) {
    console.log('\n❌ Erreur de connexion:', error.message)
    console.log('📋 Détails de l\'erreur:', error)
    
    // Suggestions de diagnostic
    console.log('\n💡 Suggestions de diagnostic:')
    if (error.message.includes('At least one protocol must be specified')) {
      console.log('  - Vérifiez que les deux nœuds utilisent les mêmes protocoles')
      console.log('  - Vérifiez que le nœud distant est encore en vie')
      console.log('  - Essayez avec une adresse TCP au lieu de WebSocket')
    }
    if (error.message.includes('connect ECONNREFUSED')) {
      console.log('  - Le nœud distant a refusé la connexion')
      console.log('  - Vérifiez que le port est correct')
      console.log('  - Vérifiez que le nœud distant écoute sur cette adresse')
    }
  }

  await libp2p.stop()
  console.log('\nTest terminé')
}

testConnection().catch(console.error)