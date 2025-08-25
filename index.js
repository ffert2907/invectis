import { initializeWallet } from './wallet.js'
import { createNode } from './p2p.js'
import { createPaymentTransaction, verifyTransaction, signTransaction } from './transaction.js'
import { multiaddr } from '@multiformats/multiaddr'
import { peerIdFromString } from '@libp2p/peer-id'
import readline from 'readline'
import clipboardy from 'clipboardy'

// Configuration des arguments de ligne de commande
const walletFile = process.argv[2] || 'wallet.dat'
const peerAddress = process.argv[3]

// Configuration de readline pour l'entrée utilisateur
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

// Topic GossipSub pour les transactions
const TOPIC = '/invectis/transactions/1.0'

async function main() {
  try {
    // Initialisation du portefeuille
    console.log('Initialisation du portefeuille...')
    const wallet = await initializeWallet(walletFile)
    console.log('Identité:', wallet.peerId.toString())

    // Initialisation du nœud P2P
    console.log('Initialisation du nœud P2P...')
    const node = await createNode(wallet.peerId)
    
    // Démarrage du nœud
    await node.start()
    console.log('Nœud démarré avec succès')
    
    // Debug: Affichage des protocoles supportés
    console.log('\n🔍 DEBUG: Protocoles supportés par ce nœud:')
    const protocols = await node.libp2p.handle([])
    console.log('Protocols handled:', Array.from(node.libp2p.getProtocols()))
    
    // Affichage des adresses d'écoute
    const addresses = node.libp2p.getMultiaddrs()
    console.log('\nAdresses d\'écoute:')
    addresses.forEach(addr => console.log(addr.toString()))

    // Copie automatique de l'adresse WebSocket dans le presse-papiers
    if (!peerAddress) {
      try {
        const wsAddress = addresses.find(addr => addr.toString().includes('/ws'))
        if (wsAddress) {
          await clipboardy.write(wsAddress.toString())
          console.log('\n✅ Adresse WebSocket copiée dans le presse-papiers!')
          console.log('Utilisez Ctrl+V pour la coller dans le deuxième terminal.')
        }
      } catch (error) {
        console.log('\n⚠️ Impossible de copier dans le presse-papiers:', error.message)
      }
    }

    // Connexion manuelle à un pair si une adresse est fournie
    if (peerAddress) {
      try {
        console.log(`\nConnexion à ${peerAddress}...`)
        
        // Debug: Analyse de l'adresse multiaddr
        console.log('🔍 DEBUG: Analyse de l\'adresse:')
        const ma = multiaddr(peerAddress)
        console.log('  - Adresse multiaddr parsée:', ma.toString())
        console.log('  - Protocoles dans l\'adresse:', ma.protoNames())
        console.log('  - PeerId extrait:', ma.getPeerId())
        
        // Vérification que le peer existe encore
        console.log('🔍 DEBUG: Tentative de connexion...')
        const connection = await node.libp2p.dial(ma)
        console.log('✅ Connecté avec succès')
        console.log('🔍 DEBUG: Détails de la connexion:')
        console.log('  - Remote peer:', connection.remotePeer.toString())
        console.log('  - Remote addr:', connection.remoteAddr.toString())
        console.log('  - Status:', connection.status)
        
      } catch (error) {
        console.error('❌ Erreur de connexion:', error.message)
        console.error('🔍 DEBUG: Stack trace complet:')
        console.error(error)
        
        // Analyse plus poussée de l'erreur
        if (error.message.includes('At least one protocol must be specified')) {
          console.log('🔍 DEBUG: Analyse de l\'erreur "protocol must be specified":')
          console.log('  - Cette erreur peut venir de:')
          console.log('    1. Incompatibilité des transports (TCP vs WebSocket)')
          console.log('    2. Protocoles de chiffrement non compatibles')
          console.log('    3. Nœud destinataire non accessible')
          
          // Essai avec une adresse TCP si on a une adresse WS
          if (peerAddress.includes('/ws')) {
            const tcpAddress = peerAddress.replace('/ws', '')
            console.log(`🔍 DEBUG: Tentative avec adresse TCP: ${tcpAddress}`)
            try {
              const tcpMa = multiaddr(tcpAddress)
              const tcpConnection = await node.libp2p.dial(tcpMa)
              console.log('✅ Connexion TCP réussie!')
              console.log('🔍 DEBUG: La connexion WebSocket était le problème')
            } catch (tcpError) {
              console.log('❌ Connexion TCP également échouée:', tcpError.message)
            }
          }
        }
        
        console.log('Le nœud continuera à fonctionner en mode écoute')
      }
    }

    // Attendre un peu pour que la connexion soit établie
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Debug: Vérifier les connexions actives
    console.log('\n🔍 DEBUG: État des connexions:')
    const connections = node.libp2p.getConnections()
    console.log(`  - Nombre de connexions actives: ${connections.length}`)
    connections.forEach((conn, index) => {
      console.log(`  - Connexion ${index + 1}:`)
      console.log(`    * Peer: ${conn.remotePeer.toString()}`)
      console.log(`    * Adresse: ${conn.remoteAddr.toString()}`)
      console.log(`    * Status: ${conn.status}`)
    })

    // Abonnement au topic GossipSub
    await node.libp2p.services.pubsub.subscribe(TOPIC)
    console.log(`\n✅ Abonné au topic: ${TOPIC}`)

    // Debug: Vérifier les peers du topic
    setTimeout(async () => {
      const peers = node.libp2p.services.pubsub.getSubscribers(TOPIC)
      console.log(`🔍 DEBUG: Peers abonnés au topic ${TOPIC}:`, peers.map(p => p.toString()))
    }, 3000)

    // Gestion des messages entrants
    node.libp2p.services.pubsub.addEventListener('message', async (event) => {
      if (event.detail.topic !== TOPIC) return

      try {
        console.log('\n🔍 DEBUG: Message reçu sur le topic')
        console.log('  - Topic:', event.detail.topic)
        console.log('  - From:', event.detail.from?.toString())
        console.log('  - Data length:', event.detail.data.length)
        
        // Décodage du message
        const message = JSON.parse(new TextDecoder().decode(event.detail.data))
        console.log('  - Message décodé:', message)
        
        // Vérification de la transaction
        const authorPeerId = peerIdFromString(message.from)
        const isValid = await verifyTransaction(message, authorPeerId)
        
        if (isValid) {
          console.log('\n💸 Transaction reçue et valide:')
          console.log('De:', message.from)
          console.log('Pour:', message.to)
          console.log('Montant:', message.payload.amount, message.payload.currency)
          console.log('Horodatage:', new Date(message.timestamp).toLocaleString())
        } else {
          console.log('\n❌ Transaction reçue mais invalide!')
        }
      } catch (error) {
        console.error('Erreur de traitement du message:', error)
      }
    })

    // Gestion de l'entrée utilisateur pour envoyer des transactions
    if (peerAddress) {
      console.log('\nAppuyez sur Entrée pour envoyer une transaction...')
      
      rl.on('line', async () => {
        try {
          // Extraction du peerId du destinataire depuis l'adresse multiaddr
          const ma = multiaddr(peerAddress)
          const recipientPeerIdStr = ma.getPeerId()
          if (!recipientPeerIdStr) {
            throw new Error('Impossible d\'extraire le peerId du destinataire')
          }
          
          const recipientPeerId = peerIdFromString(recipientPeerIdStr)
          
          // Création et signature de la transaction
          const transaction = createPaymentTransaction(wallet.peerId, recipientPeerId)
          const signedTransaction = await signTransaction(transaction, wallet.sign)
          
          console.log('🔍 DEBUG: Envoi de la transaction:')
          console.log('  - Transaction:', signedTransaction)
          console.log('  - Peers disponibles sur le topic:', 
            node.libp2p.services.pubsub.getSubscribers(TOPIC).map(p => p.toString()))
          
          // Publication de la transaction
          const messageBytes = new TextEncoder().encode(JSON.stringify(signedTransaction))
          await node.libp2p.services.pubsub.publish(TOPIC, messageBytes)
          
          console.log('✅ Transaction envoyée!')
        } catch (error) {
          console.error('❌ Erreur d\'envoi:', error.message)
          console.error('🔍 DEBUG: Stack trace:', error)
        }
      })
    }

    // Gestion de la fermeture propre
    process.on('SIGINT', async () => {
      console.log('\nFermeture du nœud...')
      rl.close()
      await node.stop()
      process.exit(0)
    })

  } catch (error) {
    console.error('Erreur:', error)
    console.error('🔍 DEBUG: Stack trace complet:', error)
    process.exit(1)
  }
}

// Lancement de l'application
main()