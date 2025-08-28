import React, { useState } from 'react';
import { Wallet, Send, Download, Settings, User, ChevronRight, Eye, EyeOff, MoreHorizontal, TrendingUp, Clock, ArrowUpRight, ArrowDownLeft, Circle } from 'lucide-react';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedWallet, setSelectedWallet] = useState(0);
  const [showBalance, setShowBalance] = useState(true);
  const [showVectorDetails, setShowVectorDetails] = useState({});

  const wallets = [
    {
      id: 1,
      name: 'Wallet Principal',
      address: 'inv1x7k2m...9d4f',
      balance: { main: 1247.58, vectors: [124.7, 87.3, 156.9, 92.1, 78.4, 201.2, 45.6, 133.8, 67.2] }
    },
    {
      id: 2,
      name: 'Wallet Trading',
      address: 'inv2h8n5p...3a7c',
      balance: { main: 856.32, vectors: [85.6, 62.1, 103.4, 71.8, 95.7, 128.3, 39.2, 88.9, 44.1] }
    }
  ];

  const transactions = [
    { id: 1, type: 'received', amount: 125.50, address: 'inv3m9k1...8f2e', description: 'Réception paiement', reference: 'TXN-001', timestamp: '14:32' },
    { id: 2, type: 'sent', amount: -87.25, address: 'inv4p2l7...6h9j', description: 'Transfert vers exchange', reference: 'TXN-002', timestamp: '12:15' },
    { id: 3, type: 'received', amount: 256.80, address: 'inv5r8d4...2k1m', description: 'Staking rewards', reference: 'TXN-003', timestamp: '09:45' },
    { id: 4, type: 'sent', amount: -42.10, address: 'inv6t3n9...5l8p', description: 'Frais de réseau', reference: 'TXN-004', timestamp: 'Hier' },
    { id: 5, type: 'received', amount: 189.75, address: 'inv7v5s1...7n4q', description: 'Paiement service', reference: 'TXN-005', timestamp: 'Hier' },
  ];

  const conversionRates = [0.1, 0.07, 0.126, 0.074, 0.063, 0.162, 0.037, 0.108, 0.054];

  const toggleVectorDetails = (txId) => {
    setShowVectorDetails(prev => ({
      ...prev,
      [txId]: !prev[txId]
    }));
  };

  const renderDashboard = () => (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-900 to-green-800 p-6 rounded-b-3xl shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Invectis</h1>
            <p className="text-green-200 text-sm">{wallets[selectedWallet].name}</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="p-2 bg-green-800 rounded-full"
            >
              {showBalance ? <Eye className="w-5 h-5 text-green-200" /> : <EyeOff className="w-5 h-5 text-green-200" />}
            </button>
            <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
              <div className="w-3 h-3 bg-gray-900 rounded-full"></div>
            </div>
          </div>
        </div>

        {/* Balance Principal */}
        <div className="text-center mb-6">
          <p className="text-green-200 text-sm mb-1">Solde Principal</p>
          <h2 className="text-4xl font-bold text-white mb-1">
            {showBalance ? `${wallets[selectedWallet].balance.main.toFixed(2)}` : '••••••'}
          </h2>
          <p className="text-green-200 text-sm flex items-center justify-center">
            <Clock className="w-4 h-4 mr-1" />
            IVT-h (heures)
          </p>
        </div>

        {/* Graphique Vectoriel */}
        <div className="bg-green-800/30 rounded-2xl p-4 mb-6">
          <div className="flex justify-between items-center mb-3">
            <p className="text-green-200 text-sm font-medium">Répartition Vectorielle</p>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="grid grid-cols-9 gap-1 mb-3">
            {wallets[selectedWallet].balance.vectors.map((value, index) => (
              <div key={index} className="flex flex-col items-center">
                <div
                  className="w-4 bg-gradient-to-t from-green-600 to-amber-400 rounded-sm mb-1"
                  style={{ height: `${(value / 250) * 40 + 10}px` }}
                ></div>
                <span className="text-green-300 text-xs">V{index + 1}</span>
              </div>
            ))}
          </div>
          {showBalance && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              {wallets[selectedWallet].balance.vectors.slice(0, 9).map((value, index) => (
                <div key={index} className="text-center">
                  <p className="text-green-300">V{index + 1}: {value.toFixed(1)}</p>
                  <p className="text-green-400 text-xs">({conversionRates[index]}h)</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Boutons Actions */}
        <div className="flex space-x-4">
          <button className="flex-1 bg-amber-500 text-gray-900 font-semibold py-4 rounded-2xl flex items-center justify-center space-x-2 hover:bg-amber-400 transition-colors">
            <Send className="w-5 h-5" />
            <span>Envoyer</span>
          </button>
          <button className="flex-1 bg-green-700 text-white font-semibold py-4 rounded-2xl flex items-center justify-center space-x-2 hover:bg-green-600 transition-colors">
            <Download className="w-5 h-5" />
            <span>Recevoir</span>
          </button>
        </div>
      </div>

      {/* Transactions */}
      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-semibold text-lg">Dernières Transactions</h3>
          <button className="text-amber-400 text-sm font-medium">Voir tout</button>
        </div>

        <div className="space-y-3">
          {transactions.map((tx) => (
            <div key={tx.id} className="bg-gray-800 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-full ${tx.type === 'received' ? 'bg-green-600' : 'bg-red-600'}`}>
                    {tx.type === 'received' ?
                      <ArrowDownLeft className="w-4 h-4 text-white" /> :
                      <ArrowUpRight className="w-4 h-4 text-white" />
                    }
                  </div>
                  <div>
                    <p className="text-white font-medium">{tx.description}</p>
                    <p className="text-gray-400 text-sm">{tx.address}</p>
                    <p className="text-gray-500 text-xs">Réf: {tx.reference}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${tx.type === 'received' ? 'text-green-400' : 'text-red-400'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)} IVT-h
                  </p>
                  <p className="text-gray-400 text-sm">{tx.timestamp}</p>
                  <button
                    onClick={() => toggleVectorDetails(tx.id)}
                    className="text-amber-400 text-xs mt-1 hover:text-amber-300"
                  >
                    Détails vecteurs
                  </button>
                </div>
              </div>

              {showVectorDetails[tx.id] && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <p className="text-gray-400 text-sm mb-2">Répartition vectorielle:</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {conversionRates.map((rate, index) => (
                      <div key={index} className="text-gray-300">
                        V{index + 1}: {(Math.abs(tx.amount) * rate).toFixed(2)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Bottom */}
      <div className="bg-gray-800 px-6 py-4 rounded-t-3xl">
        <div className="flex justify-around">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`flex flex-col items-center space-y-1 ${currentView === 'dashboard' ? 'text-amber-400' : 'text-gray-400'}`}
          >
            <Wallet className="w-6 h-6" />
            <span className="text-xs">Accueil</span>
          </button>
          <button
            onClick={() => setCurrentView('wallets')}
            className={`flex flex-col items-center space-y-1 ${currentView === 'wallets' ? 'text-amber-400' : 'text-gray-400'}`}
          >
            <Circle className="w-6 h-6" />
            <span className="text-xs">Wallets</span>
          </button>
          <button
            onClick={() => setCurrentView('account')}
            className={`flex flex-col items-center space-y-1 ${currentView === 'account' ? 'text-amber-400' : 'text-gray-400'}`}
          >
            <User className="w-6 h-6" />
            <span className="text-xs">Compte</span>
          </button>
          <button
            onClick={() => setCurrentView('settings')}
            className={`flex flex-col items-center space-y-1 ${currentView === 'settings' ? 'text-amber-400' : 'text-gray-400'}`}
          >
            <Settings className="w-6 h-6" />
            <span className="text-xs">Paramètres</span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderWallets = () => (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="bg-gradient-to-r from-green-900 to-green-800 p-6 rounded-b-3xl">
        <h1 className="text-2xl font-bold text-white mb-2">Mes Wallets</h1>
        <p className="text-green-200 text-sm">Gérez vos portefeuilles crypto</p>
      </div>

      <div className="flex-1 p-6">
        <div className="space-y-4">
          {wallets.map((wallet, index) => (
            <div
              key={wallet.id}
              onClick={() => {
                setSelectedWallet(index);
                setCurrentView('dashboard');
              }}
              className={`bg-gray-800 rounded-2xl p-4 cursor-pointer transition-all ${selectedWallet === index ? 'ring-2 ring-amber-400' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-600 to-green-800 rounded-xl flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">{wallet.name}</h3>
                    <p className="text-gray-400 text-sm">{wallet.address}</p>
                    <p className="text-green-400 font-medium">{wallet.balance.main.toFixed(2)} IVT-h</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </div>
          ))}

          <button className="w-full bg-green-800 text-white font-semibold py-4 rounded-2xl border-2 border-dashed border-green-600 hover:bg-green-700 transition-colors">
            + Ajouter un wallet
          </button>
        </div>
      </div>

      <div className="bg-gray-800 px-6 py-4 rounded-t-3xl">
        <div className="flex justify-around">
          <button
            onClick={() => setCurrentView('dashboard')}
            className="flex flex-col items-center space-y-1 text-gray-400"
          >
            <Wallet className="w-6 h-6" />
            <span className="text-xs">Accueil</span>
          </button>
          <button className="flex flex-col items-center space-y-1 text-amber-400">
            <Circle className="w-6 h-6" />
            <span className="text-xs">Wallets</span>
          </button>
          <button
            onClick={() => setCurrentView('account')}
            className="flex flex-col items-center space-y-1 text-gray-400"
          >
            <User className="w-6 h-6" />
            <span className="text-xs">Compte</span>
          </button>
          <button
            onClick={() => setCurrentView('settings')}
            className="flex flex-col items-center space-y-1 text-gray-400"
          >
            <Settings className="w-6 h-6" />
            <span className="text-xs">Paramètres</span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderAccount = () => (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="bg-gradient-to-r from-green-900 to-green-800 p-6 rounded-b-3xl">
        <h1 className="text-2xl font-bold text-white mb-2">Compte</h1>
        <p className="text-green-200 text-sm">Informations personnelles</p>
      </div>

      <div className="flex-1 p-6">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full mx-auto mb-4 flex items-center justify-center">
            <User className="w-10 h-10 text-gray-900" />
          </div>
          <h2 className="text-white text-xl font-semibold">Utilisateur Invectis</h2>
          <p className="text-gray-400">Membre depuis 2024</p>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-800 rounded-2xl p-4">
            <h3 className="text-white font-medium mb-2">Portfolio Total</h3>
            <p className="text-2xl font-bold text-amber-400">{(wallets.reduce((sum, w) => sum + w.balance.main, 0)).toFixed(2)} IVT-h</p>
          </div>

          <div className="bg-gray-800 rounded-2xl p-4">
            <h3 className="text-white font-medium mb-3">Statistiques</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Wallets connectés</span>
                <span className="text-white">{wallets.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Transactions ce mois</span>
                <span className="text-white">47</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Dernière connexion</span>
                <span className="text-white">Maintenant</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 px-6 py-4 rounded-t-3xl">
        <div className="flex justify-around">
          <button
            onClick={() => setCurrentView('dashboard')}
            className="flex flex-col items-center space-y-1 text-gray-400"
          >
            <Wallet className="w-6 h-6" />
            <span className="text-xs">Accueil</span>
          </button>
          <button
            onClick={() => setCurrentView('wallets')}
            className="flex flex-col items-center space-y-1 text-gray-400"
          >
            <Circle className="w-6 h-6" />
            <span className="text-xs">Wallets</span>
          </button>
          <button className="flex flex-col items-center space-y-1 text-amber-400">
            <User className="w-6 h-6" />
            <span className="text-xs">Compte</span>
          </button>
          <button
            onClick={() => setCurrentView('settings')}
            className="flex flex-col items-center space-y-1 text-gray-400"
          >
            <Settings className="w-6 h-6" />
            <span className="text-xs">Paramètres</span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="bg-gradient-to-r from-green-900 to-green-800 p-6 rounded-b-3xl">
        <h1 className="text-2xl font-bold text-white mb-2">Paramètres</h1>
        <p className="text-green-200 text-sm">Configuration de l'application</p>
      </div>

      <div className="flex-1 p-6">
        <div className="space-y-6">
          <div>
            <h3 className="text-white font-semibold mb-3">Réseau</h3>
            <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Serveur principal</span>
                <span className="text-green-400 text-sm">En ligne</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Nodes connectés</span>
                <span className="text-white">12</span>
              </div>
              <button className="w-full bg-green-700 text-white py-3 rounded-xl">
                Gérer les nodes
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-3">Préférences</h3>
            <div className="bg-gray-800 rounded-2xl p-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Mode sombre</span>
                <div className="w-12 h-6 bg-amber-500 rounded-full relative">
                  <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 right-0.5"></div>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Notifications</span>
                <div className="w-12 h-6 bg-green-600 rounded-full relative">
                  <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 right-0.5"></div>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Unité d'affichage</span>
                <span className="text-amber-400">IVT-h</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-3">Sécurité</h3>
            <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
              <button className="w-full text-left text-gray-300 py-2">
                Changer le code PIN
                <ChevronRight className="w-4 h-4 float-right mt-0.5" />
              </button>
              <button className="w-full text-left text-gray-300 py-2">
                Sauvegarde de récupération
                <ChevronRight className="w-4 h-4 float-right mt-0.5" />
              </button>
              <button className="w-full text-left text-gray-300 py-2">
                Authentification biométrique
                <ChevronRight className="w-4 h-4 float-right mt-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 px-6 py-4 rounded-t-3xl">
        <div className="flex justify-around">
          <button
            onClick={() => setCurrentView('dashboard')}
            className="flex flex-col items-center space-y-1 text-gray-400"
          >
            <Wallet className="w-6 h-6" />
            <span className="text-xs">Accueil</span>
          </button>
          <button
            onClick={() => setCurrentView('wallets')}
            className="flex flex-col items-center space-y-1 text-gray-400"
          >
            <Circle className="w-6 h-6" />
            <span className="text-xs">Wallets</span>
          </button>
          <button
            onClick={() => setCurrentView('account')}
            className="flex flex-col items-center space-y-1 text-gray-400"
          >
            <User className="w-6 h-6" />
            <span className="text-xs">Compte</span>
          </button>
          <button className="flex flex-col items-center space-y-1 text-amber-400">
            <Settings className="w-6 h-6" />
            <span className="text-xs">Paramètres</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-md mx-auto h-screen bg-gray-900 relative overflow-hidden">
      {currentView === 'dashboard' && renderDashboard()}
      {currentView === 'wallets' && renderWallets()}
      {currentView === 'account' && renderAccount()}
      {currentView === 'settings' && renderSettings()}
    </div>
  );
};

export default App;
