import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

const Send = ({ recipientId, setRecipientId, setCurrentView, currentView }) => {
  const scannerRef = useRef(null);

  useEffect(() => {
    if (currentView !== 'send' || scannerRef.current) {
      return;
    }

    const scanner = new Html5QrcodeScanner(
      'qr-scanner-container',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false // verbose
    );

    scannerRef.current = scanner;

    const onScanSuccess = (decodedText) => {
      setRecipientId(decodedText);
      // maybe need to delete this next line ?
      scanner.clear();
    };

    const onScanFailure = () => {
      // console.warn(`Code scan error = ${error}`);
    };

    scanner.render(onScanSuccess, onScanFailure);

    return () => {

      if (scannerRef.current) {
        scannerRef.current.clear().catch(error => {
          console.error("Failed to clear scanner.", error);
        });
        scannerRef.current = null;
      }
    };
  }, [currentView, setRecipientId]);

  useEffect(() => {
    if (recipientId && scannerRef.current) {
        scannerRef.current.clear().catch(error => {
            console.error("Failed to clear scanner.", error);
        });
        scannerRef.current = null;
    }
  }, [recipientId]);


  return (
    <div className="flex flex-col h-full bg-gray-900 p-6">
      <div className="bg-gradient-to-r from-green-900 to-green-800 p-6 rounded-3xl shadow-lg text-white">
        <h1 className="text-2xl font-bold mb-4">Envoyer des fonds</h1>
        <p className="text-green-200">Scannez un QR code ou saisissez un ID de pair pour envoyer des fonds.</p>
      </div>

      <div className="flex-1 flex flex-col justify-center text-white space-y-4">
        <div>
          <label htmlFor="recipientId" className="text-sm text-gray-400">ID de Pair du destinataire</label>
          <input
            id="recipientId"
            type="text"
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            placeholder="Saisir l'ID du pair"
            className="w-full bg-gray-800 p-3 rounded-lg mt-1"
          />
        </div>

        <div id="qr-scanner-container" className="w-full rounded-lg overflow-hidden">
          {/* QR Scanner will be mounted here */}
        </div>

        <button
          onClick={() => {
            // Logic to send transaction
            alert(`Sending to: ${recipientId}`);
          }}
          className="bg-amber-500 text-gray-900 font-semibold py-4 rounded-2xl"
        >
          Envoyer
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

export default Send;
