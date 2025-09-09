import React, { useState, useMemo } from 'react';
import { QRCodeSVG as QRCode } from 'qrcode.react';

const Receive = ({ status, setCurrentView, vectors: vectorData }) => {
  const [amount, setAmount] = useState('');
  const [vectorAmounts, setVectorAmounts] = useState(Array(9).fill(''));

  const handleVectorChange = (index, value) => {
    const newVectors = [...vectorAmounts];
    newVectors[index] = value;
    setVectorAmounts(newVectors);
  };

  const qrCodeValue = useMemo(() => {
    const isDataEntered = amount.trim() !== '' || vectorAmounts.some(v => v.trim() !== '');
    if (!isDataEntered) {
      return status.peerId;
    }
    const parts = [status.peerId, amount, ...vectorAmounts].map(part => part || '');
    return parts.join(';');
  }, [status.peerId, amount, vectorAmounts]);

  return (
    <div className="flex flex-col h-full bg-gray-900 p-6 overflow-y-auto">
      <div className="bg-gradient-to-r from-green-900 to-green-800 p-6 rounded-3xl shadow-lg text-white">
        <h1 className="text-2xl font-bold mb-4">Recevoir</h1>
        <p className="text-green-200">Partagez votre QR code ou votre ID de pair. Spécifiez un montant pour l'inclure dans le QR code.</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-white space-y-4 py-4">
        <div className="bg-white p-4 rounded-lg">
          <QRCode value={qrCodeValue} size={180} />
        </div>

        <div className="w-full max-w-xs space-y-2">
            <div className="flex items-center bg-gray-800 rounded-lg">
                <span className="px-2 text-lg">{vectorData[0]?.[2] ?? '⏰'}</span>
                <input
                  type="number"
                  placeholder={vectorData[0]?.[1] ?? 'Nombre en heures'}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-transparent p-2 w-full"
                />
            </div>

          {vectorAmounts.map((vec, index) => (
            <div key={index} className="flex items-center bg-gray-800 rounded-lg">
                <span className="px-2 text-lg">{vectorData[index + 1]?.[2] ?? '❔'}</span>
                <input
                  type="number"
                  placeholder={vectorData[index + 1]?.[1] ?? `Vecteur ${index + 1}`}
                  value={vec}
                  onChange={(e) => handleVectorChange(index, e.target.value)}
                  className="bg-transparent p-2 w-full"
                />
            </div>
          ))}
        </div>

        <p className="font-mono break-all text-center mt-2 text-sm">{status.peerId}</p>
        <button
          onClick={() => {
            const isDataEntered = amount.trim() !== '' || vectorAmounts.some(v => v.trim() !== '');
            navigator.clipboard.writeText(isDataEntered ? qrCodeValue : status.peerId);
          }}
          className="mt-4 bg-amber-500 text-gray-900 font-semibold py-2 px-6 rounded-xl"
        >
          Copier les données du QR
        </button>
      </div>

      <div className="text-center py-2">
        <button
          onClick={() => setCurrentView('dashboard')}
          className="text-gray-400"
        >
          Retour
        </button>
      </div>
    </div>
  );
};

export default Receive;
