import React from 'react';
import { QRCodeSVG as QRCode } from 'qrcode.react';

const Receive = ({ status, setCurrentView }) => (
  <div className="flex flex-col h-full bg-gray-900 p-6">
    <div className="bg-gradient-to-r from-green-900 to-green-800 p-6 rounded-3xl shadow-lg text-white">
      <h1 className="text-2xl font-bold mb-4">Recevoir des fonds</h1>
      <p className="text-green-200">Partagez votre QR code ou votre ID de pair pour recevoir des fonds.</p>
    </div>

    <div className="flex-1 flex flex-col items-center justify-center text-white">
      <div className="bg-white p-4 rounded-lg">
        <QRCode value={status.peerId} size={200} />
      </div>
      <p className="mt-4 text-sm text-gray-400">Votre ID de Pair:</p>
      <p className="font-mono break-all text-center mt-2">{status.peerId}</p>
      <button
        onClick={() => navigator.clipboard.writeText(status.peerId)}
        className="mt-4 bg-amber-500 text-gray-900 font-semibold py-2 px-6 rounded-xl"
      >
        Copier l'ID
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

export default Receive;
