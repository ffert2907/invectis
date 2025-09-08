import React, { useState, useMemo } from 'react';
import { QRCodeSVG as QRCode } from 'qrcode.react';

const Receive = ({ status, setCurrentView }) => {
  const [amount, setAmount] = useState('');
  const [vectors, setVectors] = useState(Array(9).fill(''));

  const handleVectorChange = (index, value) => {
    const newVectors = [...vectors];
    newVectors[index] = value;
    setVectors(newVectors);
  };

  const qrCodeValue = useMemo(() => {
    const parts = [status.peerId, amount, ...vectors].map(part => part || '');
    return parts.join(';');
  }, [status.peerId, amount, vectors]);

  return (
    <div className="flex flex-col h-full bg-gray-900 p-6">
      <div className="bg-gradient-to-r from-green-900 to-green-800 p-6 rounded-3xl shadow-lg text-white">
        <h1 className="text-2xl font-bold mb-4">Recevoir des fonds</h1>
        <p className="text-green-200">Partagez votre QR code ou votre ID de pair pour recevoir des fonds. Vous pouvez spécifier un montant.</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-white space-y-4">
        <div className="bg-white p-4 rounded-lg">
          <QRCode value={qrCodeValue} size={200} />
        </div>

        <input
          type="number"
          placeholder="Montant en heures"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="bg-gray-800 p-2 rounded-lg w-full max-w-xs"
        />

        <div className="grid grid-cols-3 gap-2 w-full max-w-xs">
          {vectors.map((vec, index) => (
            <input
              key={index}
              type="number"
              placeholder={`Vecteur ${index + 1}`}
              value={vec}
              onChange={(e) => handleVectorChange(index, e.target.value)}
              className="bg-gray-800 p-2 rounded-lg text-center"
            />
          ))}
        </div>

        <p className="font-mono break-all text-center mt-2 text-sm">{status.peerId}</p>
        <button
          onClick={() => navigator.clipboard.writeText(qrCodeValue)}
          className="mt-4 bg-amber-500 text-gray-900 font-semibold py-2 px-6 rounded-xl"
        >
          Copier les données du QR
        </button>
      </div>

      <div className="text-center">
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
