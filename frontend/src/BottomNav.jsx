import React from 'react';
import { Wallet, Circle, User, Settings, List } from 'lucide-react';

const BottomNav = ({ currentView, setCurrentView }) => {
  const navItems = [
    { view: 'dashboard', icon: Wallet, label: 'Accueil' },
    { view: 'wallets', icon: Circle, label: 'Wallets' },
    { view: 'transactions', icon: List, label: 'Transactions' },
    { view: 'account', icon: User, label: 'Compte' },
    { view: 'settings', icon: Settings, label: 'Paramètres' },
  ];

  return (
    <div className="bg-gray-800 px-6 py-4 rounded-t-3xl">
      <div className="flex justify-around">
        {navItems.map((item) => (
          <button
            key={item.view}
            onClick={() => setCurrentView(item.view)}
            className={`flex flex-col items-center space-y-1 ${
              currentView === item.view ? 'text-amber-400' : 'text-gray-400'
            }`}
          >
            <item.icon className="w-6 h-6" />
            <span className="text-xs">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default BottomNav;
