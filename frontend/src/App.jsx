import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet, Send, Download, Settings, User, ChevronRight, Eye, EyeOff, MoreHorizontal, TrendingUp, Clock, ArrowUpRight, ArrowDownLeft, Circle, Star, List, Building, Factory, RefreshCw } from 'lucide-react';
import { QRCodeSVG as QRCode } from 'qrcode.react';
//import { QRCodeSVG as QRCode } from code.react';
import countries from './countries';
import Receive from './Receive';
import SendComponent from './Send';
import BottomNav from './BottomNav';
import LanguageSelector from './LanguageSelector';

const AccountIcon = ({ type, className }) => {
  if (type === 'individual') {
    return <User className={className} />;
  } else if (type === 'entreprise') {
    return <Building className={className} />;
  }
  return <Wallet className={className} />; // Fallback icon
};

function App() {
  const { t } = useTranslation();
  const [vectors, setVectors] = useState([]);
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedWallet, setSelectedWallet] = useState(0);
  const [principalWalletId, setPrincipalWalletId] = useState(null);
  const [newWallet, setNewWallet] = useState({
    name: '',
    givenName: '',
    familyName: '',
    dateOfBirth: '',
    countryOfBirth: '',
    cityOfBirth: '',
    accountType: 'individual'
  });
  const [showBalance, setShowBalance] = useState(false);
  const [showVectorDetails, setShowVectorDetails] = useState({});
  const [status, setStatus] = useState({ peerId: '', connections: 0 });
  const [showQrModal, setShowQrModal] = useState(false);
  const [recipientId, setRecipientId] = useState('');

  const [wallets, setWallets] = useState([]);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    if (window.electronAPI) {
      const cleanup = window.electronAPI.onBackendEvent((eventName, data) => {
        console.log(`Received backend event: ${eventName}`, data);
        if (eventName === 'node-ready') {
          setWallets(currentWallets => {
            const newWallets = [...currentWallets];
            newWallets[0] = { ...newWallets[0], address: data.peerId };
            return newWallets;
          });
        }
        if (eventName === 'new-transaction') {
          console.log('New transaction event received. Data will be updated by polling.');
        }
      });

      return cleanup; // Cleanup listener on component unmount
    }
  }, [wallets, selectedWallet]);

  const fetchWallets = async () => {
    try {
      const response = await fetch('http://localhost:3000/wallets');
      if (response.ok) {
        const fetchedWallets = await response.json();
        setWallets(fetchedWallets);
      } else {
        console.error('Failed to fetch wallets');
      }
    } catch (error) {
      console.error('Error fetching wallets:', error);
    }
  };

  useEffect(() => {
    const initialFetch = async () => {
      try {
        const response = await fetch('http://localhost:3000/wallets');
        if (response.ok) {
          const fetchedWallets = await response.json();
          setWallets(fetchedWallets);
          if (fetchedWallets.length === 0) {
            setCurrentView('wallets');
          }
        } else {
          console.error('Failed to fetch wallets');
        }
      } catch (error) {
        console.error('Error fetching wallets:', error);
      }
    };
    initialFetch();

    const interval = setInterval(async () => {
      try {
        const response = await fetch('http://localhost:3000/status');
        if (response.ok) {
          const newStatus = await response.json();
          setStatus(newStatus);
        } else {
          console.error('Failed to fetch status');
        }
      } catch (error) {
        console.error('Error fetching status:', error);
      }
    }, 5000); // Fetch status every 5 seconds

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const pollingInterval = setInterval(() => {
      console.log('Polling for new data...');
      fetchWallets();
      if (wallets.length > 0 && wallets[selectedWallet]) {
        const currentPeerId = wallets[selectedWallet].address;
        fetchTransactions(currentPeerId);
      }
    }, 15000); // Poll every 15 seconds

    return () => clearInterval(pollingInterval);
  }, [wallets, selectedWallet]);

  useEffect(() => {
    const storedPrincipalWalletId = localStorage.getItem('principalWalletId');
    if (storedPrincipalWalletId) {
      setPrincipalWalletId(JSON.parse(storedPrincipalWalletId));
    }
  }, []);

  useEffect(() => {
    if (principalWalletId) {
      localStorage.setItem('principalWalletId', JSON.stringify(principalWalletId));
    }
  }, [principalWalletId]);

  useEffect(() => {
    if (principalWalletId) {
      const walletIndex = wallets.findIndex(wallet => wallet.id === principalWalletId);
      if (walletIndex !== -1) {
        setSelectedWallet(walletIndex);
      }
    }
  }, [principalWalletId, wallets]);

  const fetchTransactions = async (peerId) => {
    if (!peerId) {
      setTransactions([]);
      return;
    }
    try {
      const response = await fetch(`http://localhost:3000/wallets/${peerId}/transactions`);
      if (response.ok) {
        const fetchedTransactions = await response.json();
        setTransactions(fetchedTransactions);
      } else {
        console.error('Failed to fetch transactions');
        setTransactions([]);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setTransactions([]);
    }
  };

  useEffect(() => {
    if (wallets.length > 0 && wallets[selectedWallet]) {
      const currentPeerId = wallets[selectedWallet].address;
      fetchTransactions(currentPeerId);
    } else {
      setTransactions([]);
    }
  }, [selectedWallet, wallets]);

  useEffect(() => {
    const fetchVectors = async () => {
      try {
        const response = await fetch('http://localhost:3000/vectors');
        if (response.ok) {
          const fetchedVectors = await response.json();
          setVectors(fetchedVectors);
        } else {
          console.error('Failed to fetch vectors');
        }
      } catch (error) {
        console.error('Error fetching vectors:', error);
      }
    };
    fetchVectors();
  }, []);

  const conversionRates = [0.1, 0.07, 0.126, 0.074, 0.063, 0.162, 0.037, 0.108, 0.054];

  const toggleVectorDetails = (txId) => {
    setShowVectorDetails(prev => ({
      ...prev,
      [txId]: !prev[txId]
    }));
  };

  const handleRefresh = () => {
    console.log('Manual refresh triggered.');
    fetchWallets();
    if (wallets.length > 0 && wallets[selectedWallet]) {
      const currentPeerId = wallets[selectedWallet].address;
      fetchTransactions(currentPeerId);
    }
  };

  const renderDashboard = () => (
    <div className="flex flex-col h-full bg-gray-900">
      {/* QR Code Modal */}
      {showQrModal && (
        <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg text-center">
            <h2 className="text-lg font-bold mb-4">{t('scanQrCodeToConnect')}</h2>
            <QRCode value={status.peerId} size={256} />
            <button onClick={() => setShowQrModal(false)} className="mt-4 bg-gray-800 text-white px-4 py-2 rounded-md">{t('close')}</button>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="bg-gradient-to-r from-green-900 to-green-800 p-6 rounded-b-3xl shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{t('invectis')}</h1>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="p-2 bg-green-800 rounded-full"
            >
              {showBalance ? <Eye className="w-5 h-5 text-green-200" /> : <EyeOff className="w-5 h-5 text-green-200" />}
            </button>
            <button
              onClick={handleRefresh}
              className="p-2 bg-green-800 rounded-full"
            >
              <RefreshCw className="w-5 h-5 text-green-200" />
            </button>
            <LanguageSelector />
          </div>
        </div>

        {/* Peer ID and Status */}
        <div className="bg-gray-800/50 rounded-2xl p-4 mb-6 text-white">
          <div>
            <p className="text-sm text-gray-400">{t('yourPeerId')}</p>
            <p className="font-mono text-sm break-all">{status.peerId}</p>
          </div>
          <div className="flex justify-between items-center mt-2">
            <div>
              <p className="text-lg font-bold">{t('connections', { count: status.connections })}</p>
            </div>
            <div className="flex space-x-2">
              <button onClick={() => navigator.clipboard.writeText(status.peerId)} className="text-xs bg-gray-700 px-2 py-1 rounded-md">{t('copyId')}</button>
              <button onClick={() => setShowQrModal(true)} className="text-xs bg-gray-700 px-2 py-1 rounded-md">{t('showQr')}</button>
            </div>
          </div>
        </div>

        {/* Balance Principal */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center text-green-200 text-sm mb-1">
            {wallets[selectedWallet]?.accountType === 'individual' && <User className="w-4 h-4 mr-2" />}
            {wallets[selectedWallet]?.accountType === 'entreprise' && <Factory className="w-4 h-4 mr-2" />}
            <span>{t('mainBalance')}</span>
            <span className="text-xs ml-2">({wallets[selectedWallet]?.name})</span>
          </div>
          <h2 className="text-4xl font-bold text-white mb-1 flex items-center justify-center">
            {showBalance && wallets[selectedWallet] ? `${wallets[selectedWallet].balance.main.toFixed(2)}` : '••••••'}
            {vectors[0] && <span className="ml-2">{vectors[0][2]}</span>}
          </h2>
          <p className="text-green-200 text-sm flex items-center justify-center">
            {wallets[selectedWallet] && <AccountIcon type={wallets[selectedWallet].accountType} className="w-4 h-4 mr-1" />}
            <Clock className="w-4 h-4 mr-1" />
            {vectors[0] ? `IVT-h (${vectors[0][0]})` : 'IVT-h'}
          </p>
        </div>

        {/* Graphique Vectoriel */}
        <div className="bg-green-800/30 rounded-2xl p-4 mb-6">
          <div className="flex justify-between items-center mb-3">
            <p className="text-green-200 text-sm font-medium">{t('vectorialDistribution')}</p>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className="grid grid-cols-9 gap-1 mb-3">
            {wallets[selectedWallet]?.balance.vectors.map((value, index) => (
              <div key={index} className="flex flex-col items-center">
                <div
                  className="w-4 bg-gradient-to-t from-green-600 to-amber-400 rounded-sm mb-1"
                  style={{ height: `${(value / 250) * 40 + 10}px` }}
                ></div>
                <span className="text-green-300 text-xs">{vectors[index + 1]?.[2] ?? `V${index + 2}`}</span>
              </div>
            ))}
          </div>
          {showBalance && wallets[selectedWallet] && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              {wallets[selectedWallet].balance.vectors.slice(0, 9).map((value, index) => (
                <div key={index} className="text-center">
                  <p className="text-green-300">{vectors[index + 1]?.[2]} {vectors[index + 1]?.[0] ?? `V${index + 2}`}: {value.toFixed(1)}</p>
                  <p className="text-green-400 text-xs">({conversionRates[index]}h)</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Boutons Actions */}
        <div className="flex space-x-4">
          <button
            onClick={() => setCurrentView('send')}
            className="flex-1 bg-amber-500 text-gray-900 font-semibold py-4 rounded-2xl flex items-center justify-center space-x-2 hover:bg-amber-400 transition-colors"
          >
            <Send className="w-5 h-5" />
            <span>{t('send')}</span>
          </button>
          <button
            onClick={() => setCurrentView('receive')}
            className="flex-1 bg-green-700 text-white font-semibold py-4 rounded-2xl flex items-center justify-center space-x-2 hover:bg-green-600 transition-colors"
          >
            <Download className="w-5 h-5" />
            <span>{t('receive')}</span>
          </button>
        </div>
      </div>

        {wallets[selectedWallet]?.accountType === 'entreprise' && (
          <div className="mt-4">
            <button
              onClick={() => alert('Créer une note clicked')}
              className="w-full bg-blue-600 text-white font-semibold py-4 rounded-2xl hover:bg-blue-500 transition-colors"
            >
              {t('createNote')}
            </button>
          </div>
        )}

      {/* spacer */}
      <div className="flex-1 p-6"></div>


      <BottomNav currentView={currentView} setCurrentView={setCurrentView} />
    </div>
  );

  const renderWallets = () => (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="bg-gradient-to-r from-green-900 to-green-800 p-6 rounded-b-3xl">
        <h1 className="text-2xl font-bold text-white mb-2">{t('wallets')}</h1>
        <p className="text-green-200 text-sm">{t('manageYourWallets')}</p>
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
                    <AccountIcon type={wallet.accountType} className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">{wallet.name}</h3>
                    <p className="text-gray-400 text-sm">{wallet.address}</p>
                    <p className="text-green-400 font-medium">{wallet.balance.main.toFixed(2)} IVT-h</p>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setPrincipalWalletId(wallet.id); }} className="p-2 -m-2">
                  <Star className={`w-5 h-5 ${principalWalletId === wallet.id ? 'text-yellow-400 fill-current' : 'text-gray-600'}`} />
                </button>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </div>
          ))}

          <button onClick={() => setCurrentView('addWalletInfo')} className="w-full bg-green-800 text-white font-semibold py-4 rounded-2xl border-2 border-dashed border-green-600 hover:bg-green-700 transition-colors">
            + {t('addWallet')}
          </button>
        </div>
      </div>

      <BottomNav currentView={currentView} setCurrentView={setCurrentView} />
    </div>
  );

  const renderAccount = () => (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="bg-gradient-to-r from-green-900 to-green-800 p-6 rounded-b-3xl">
        <h1 className="text-2xl font-bold text-white mb-2">{t('account')}</h1>
        <p className="text-green-200 text-sm">{t('personalInformation')}</p>
      </div>

      <div className="flex-1 p-6">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full mx-auto mb-4 flex items-center justify-center">
            <User className="w-10 h-10 text-gray-900" />
          </div>
          <h2 className="text-white text-xl font-semibold">{t('invectisUser')}</h2>
          <p className="text-gray-400">{t('memberSince')}</p>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-800 rounded-2xl p-4">
            <h3 className="text-white font-medium mb-2">{t('totalPortfolio')}</h3>
            <p className="text-2xl font-bold text-amber-400">{(wallets.reduce((sum, w) => sum + w.balance.main, 0)).toFixed(2)} IVT-h</p>
          </div>

          <div className="bg-gray-800 rounded-2xl p-4">
            <h3 className="text-white font-medium mb-3">{t('statistics')}</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">{t('connectedWallets')}</span>
                <span className="text-white">{wallets.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('transactionsThisMonth')}</span>
                <span className="text-white">47</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{t('lastConnection')}</span>
                <span className="text-white">{t('now')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <BottomNav currentView={currentView} setCurrentView={setCurrentView} />
    </div>
  );

  const renderSettings = () => (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="bg-gradient-to-r from-green-900 to-green-800 p-6 rounded-b-3xl">
        <h1 className="text-2xl font-bold text-white mb-2">{t('settings')}</h1>
        <p className="text-green-200 text-sm">{t('appConfiguration')}</p>
      </div>

      <div className="flex-1 p-6">
        <div className="space-y-6">
          <div>
            <h3 className="text-white font-semibold mb-3">{t('network')}</h3>
            <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">{t('mainServer')}</span>
                <span className="text-green-400 text-sm">{t('online')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">{t('connectedNodes')}</span>
                <span className="text-white">12</span>
              </div>
              <button className="w-full bg-green-700 text-white py-3 rounded-xl">
                {t('manageNodes')}
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-3">{t('preferences')}</h3>
            <div className="bg-gray-800 rounded-2xl p-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">{t('darkMode')}</span>
                <div className="w-12 h-6 bg-amber-500 rounded-full relative">
                  <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 right-0.5"></div>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">{t('notifications')}</span>
                <div className="w-12 h-6 bg-green-600 rounded-full relative">
                  <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 right-0.5"></div>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">{t('displayUnit')}</span>
                <span className="text-amber-400">IVT-h</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-3">{t('security')}</h3>
            <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
              <button className="w-full text-left text-gray-300 py-2">
                {t('changePin')}
                <ChevronRight className="w-4 h-4 float-right mt-0.5" />
              </button>
              <button className="w-full text-left text-gray-300 py-2">
                {t('recoveryBackup')}
                <ChevronRight className="w-4 h-4 float-right mt-0.5" />
              </button>
              <button className="w-full text-left text-gray-300 py-2">
                {t('biometricAuthentication')}
                <ChevronRight className="w-4 h-4 float-right mt-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <BottomNav currentView={currentView} setCurrentView={setCurrentView} />
    </div>
  );

  const renderTransactions = () => {
    const currentPeerId = wallets[selectedWallet]?.address;

    return (
      <div className="flex flex-col h-full bg-gray-900">
        <div className="bg-gradient-to-r from-green-900 to-green-800 p-6 rounded-b-3xl">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-white">
              {t('transactions')}
              <span className="text-lg ml-2">({wallets[selectedWallet]?.name})</span>
            </h1>
            <button
              onClick={handleRefresh}
              className="p-2 bg-green-800 rounded-full"
            >
              <RefreshCw className="w-5 h-5 text-green-200" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="space-y-3">
            {transactions.map((tx) => {
              const isReceived = tx.payload.to === currentPeerId || tx.type === 'SETDAILYBONUS';
              const amount = tx.type === 'PAYMENT' ? tx.payload.amount :
                             tx.type === 'VECTOR_TRANSACTION' ? tx.payload.totalTime :
                             tx.type === 'SETDAILYBONUS' ? tx.payload.bonus : 0;
              const otherParty = isReceived ? tx.author : tx.payload.to;

              return (
                <div key={tx.id} className="bg-gray-800 rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-full ${isReceived ? 'bg-green-600' : 'bg-red-600'}`}>
                        {isReceived ?
                          <ArrowDownLeft className="w-4 h-4 text-white" /> :
                          <ArrowUpRight className="w-4 h-4 text-white" />
                        }
                      </div>
                      <div>
                        <p className="text-white font-medium">{tx.payload.description || tx.type}</p>
                        <p className="text-gray-400 text-sm truncate w-40">{otherParty}</p>
                        <p className="text-gray-500 text-xs">Réf: {tx.payload.reference || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${isReceived ? 'text-green-400' : 'text-red-400'}`}>
                        {isReceived ? '+' : '-'}{amount.toFixed(2)} IVT-h
                      </p>
                      <p className="text-gray-400 text-sm">{new Date(tx.timestamp).toLocaleString()}</p>
                      {tx.type === 'VECTOR_TRANSACTION' && (
                        <button
                          onClick={() => toggleVectorDetails(tx.id)}
                          className="text-amber-400 text-xs mt-1 hover:text-amber-300"
                        >
                          {t('vectorDetails')}
                        </button>
                      )}
                    </div>
                  </div>

                  {showVectorDetails[tx.id] && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <p className="text-gray-400 text-sm mb-2">{t('vectorialRepartition')}</p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {tx.payload.vectors.map((vec, index) => (
                          <div key={index} className="text-gray-300">
                            {vectors[index + 1]?.[2] ?? `V${index + 2}`}: {vec.time.toFixed(2)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <BottomNav currentView={currentView} setCurrentView={setCurrentView} />
      </div>
    );
  };

  const renderAddWalletInfo = () => (
    <div className="flex flex-col h-full bg-gray-900 p-6">
      <div className="bg-gradient-to-r from-green-900 to-green-800 p-6 rounded-3xl shadow-lg text-white">
        <h1 className="text-2xl font-bold mb-4">{t('addNewWallet')}</h1>
        <p className="text-green-200 mb-6">
          {t('addNewWalletDescription')}
        </p>
        <p className="text-green-200 font-semibold">
          {t('chooseNewOrExistingWallet')}
        </p>
      </div>

      <div className="flex-1 flex flex-col justify-center space-y-4">
        <button
          onClick={() => setCurrentView('createWalletForm')}
          className="bg-amber-500 text-gray-900 font-semibold py-4 rounded-2xl"
        >
          {t('createNewWallet')}
        </button>
        <button
          onClick={async () => {
            if (window.electronAPI) {
              const filePath = await window.electronAPI.openFileDialog();
              if (filePath) {
                const walletData = await window.electronAPI.readFileContent(filePath);
                if (walletData) {
                  try {
                    const response = await fetch('http://localhost:3000/wallets/import', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ name: filePath.split(/[\\/]/).pop().replace('.json', ''), walletData }),
                    });
                    if (response.ok) {
                      alert('Wallet imported successfully');
                      await fetchWallets();
                      setCurrentView('wallets');
                    } else {
                      alert('Failed to import wallet');
                    }
                  } catch (error) {
                    console.error('Error importing wallet:', error);
                    alert('Error importing wallet');
                  }
                }
              }
            } else {
              alert('Import wallet functionality not available in this environment.');
            }
          }}
          className="bg-green-700 text-white font-semibold py-4 rounded-2xl"
        >
          {t('importExistingWallet')}
        </button>
      </div>

      <div className="text-center">
        <button
          onClick={() => setCurrentView('wallets')}
          className="text-gray-400"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );

  const renderCreateWalletForm = () => (
    <div className="flex flex-col h-full bg-gray-900 p-6">
      <div className="bg-gradient-to-r from-green-900 to-green-800 p-6 rounded-3xl shadow-lg text-white">
        <h1 className="text-2xl font-bold mb-4">{t('createNewWallet')}</h1>
      </div>

      <div className="flex-1 flex flex-col justify-center space-y-4 text-white">
        <input
          type="text"
          placeholder={t('walletName')}
          value={newWallet.name}
          onChange={(e) => setNewWallet({ ...newWallet, name: e.target.value })}
          className="bg-gray-800 p-3 rounded-lg"
        />
        <div className="flex justify-around">
          <label className="flex items-center">
            <input
              type="radio"
              name="walletType"
              value="individual"
              checked={newWallet.accountType === 'individual'}
              onChange={(e) => setNewWallet({ ...newWallet, accountType: e.target.value })}
              className="mr-2"
            />
            {t('individual')}
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="walletType"
              value="entreprise"
              checked={newWallet.accountType === 'entreprise'}
              onChange={(e) => setNewWallet({ ...newWallet, accountType: e.target.value })}
              className="mr-2"
            />
            {t('entreprise')}
          </label>
        </div>

        {newWallet.accountType === 'individual' && (
          <>
            <input
              type="text"
              placeholder={t('firstName')}
              value={newWallet.givenName}
              onChange={(e) => setNewWallet({ ...newWallet, givenName: e.target.value })}
              className="bg-gray-800 p-3 rounded-lg"
            />
            <input
              type="text"
              placeholder={t('lastName')}
              value={newWallet.familyName}
              onChange={(e) => setNewWallet({ ...newWallet, familyName: e.target.value })}
              className="bg-gray-800 p-3 rounded-lg"
            />
            <input
              type="date"
              placeholder={t('dateOfBirth')}
              value={newWallet.dateOfBirth}
              onChange={(e) => setNewWallet({ ...newWallet, dateOfBirth: e.target.value })}
              className="bg-gray-800 p-3 rounded-lg"
            />
            <select
              value={newWallet.countryOfBirth}
              onChange={(e) => setNewWallet({ ...newWallet, countryOfBirth: e.target.value })}
              className="bg-gray-800 p-3 rounded-lg"
            >
              <option value="">{t('countryOfBirth')}</option>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder={t('cityOfBirth')}
              value={newWallet.cityOfBirth}
              onChange={(e) => setNewWallet({ ...newWallet, cityOfBirth: e.target.value })}
              className="bg-gray-800 p-3 rounded-lg"
            />
          </>
        )}

        <button
          onClick={async () => {
            try {
              const response = await fetch('http://localhost:3000/wallets', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(newWallet),
              });
              if (response.ok) {
                await fetchWallets();
                setCurrentView('wallets');
                setNewWallet({ name: '', givenName: '', familyName: '', dateOfBirth: '', countryOfBirth: '', cityOfBirth: '', accountType: 'individual' });
              } else {
                const errorData = await response.json();
                alert(`Failed to create wallet: ${errorData.details || response.statusText}`);
              }
            } catch (error) {
              console.error('Error creating wallet:', error);
              alert('Error creating wallet');
            }
          }}
          className="bg-amber-500 text-gray-900 font-semibold py-4 rounded-2xl"
        >
          {t('create')}
        </button>
      </div>

      <div className="text-center">
        <button
          onClick={() => setCurrentView('addWalletInfo')}
          className="text-gray-400"
        >
          {t('return')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-md mx-auto h-screen bg-gray-900 relative overflow-hidden">
      {currentView === 'dashboard' && renderDashboard()}
      {currentView === 'wallets' && renderWallets()}
      {currentView === 'account' && renderAccount()}
      {currentView === 'settings' && renderSettings()}
      {currentView === 'transactions' && renderTransactions()}
      {currentView === 'addWalletInfo' && renderAddWalletInfo()}
      {currentView === 'createWalletForm' && renderCreateWalletForm()}
      {currentView === 'receive' && <Receive status={status} setCurrentView={setCurrentView} vectors={vectors} />}
      {currentView === 'send' && <SendComponent recipientId={recipientId} setRecipientId={setRecipientId} setCurrentView={setCurrentView} currentView={currentView} />}
    </div>
  );
};

export default App;
