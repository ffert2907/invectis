# invectis
p2p earth ressources transsaction

fichier décentralisé IPFS (Helia) - Graphe Orienté Acyclique (DAG).


### Launch nodes :
```node index.js wallet1.dat```

It may copy on the clipboard the adress to connect 
```node index.js wallet1.dat [ADRESS_TO_CONNECT]```

use ```_Lance-Noeud-1.bat``` or ```_Lance-Noeud-2.bat``` to launch nodes. Or use ```_Lance-Test-Connexion.bat``` to test connection after launching node 1.


# TEST WALLETS
Wallet1.dat : TOM JERRY 1999-10-10 FR PARIS
wallet2.dat : DUFFY DUCK 1999-10-10 FR PARIS


# Android app installation
Here are the instructions to build and deploy the app to your Android device:

1. Open the Android Project in Android Studio:

    Open Android Studio.
    Click on "Open an existing Android Studio project".
    Navigate to the frontend/android directory in your project and select it.
    Android Studio will import the project and download the necessary Gradle dependencies. This might take a few minutes.

2. Build the APK:

    Once the project is opened and synced, go to the "Build" menu in Android Studio.
    Select "Build Bundle(s) / APK(s)" -> "Build APK(s)".
    Android Studio will start building the APK. You can monitor the progress in the "Build" window at the bottom of the screen.
    When the build is complete, you will see a notification. You can click on the "locate" link in the notification to find the generated APK file. It will be located in frontend/android/app/build/outputs/apk/debug/app-debug.apk.

3. Deploy to your Device:

    Connect your Android device to your computer with a USB cable.
    Make sure you have enabled USB debugging on your device.
    In Android Studio, you should see your device listed in the toolbar at the top of the window.
    Click the "Run" button (the green play icon) to build and run the app on your device.

Automation Script:

I have also created a script to automate the process of building the web app and syncing it with the Android project. You can find it at frontend/build.sh. To use it, simply run the following command from the root of your project:

cd frontend
bash build.sh

This will update your Android project with the latest changes from your web app. After running the script, you can go back to Android Studio and run the app on your device again.


# TODO
### 1 - cold transaction (not real time transaction peerID and WalletID not yet connected : example website payment or asynchone transaction)
"if a counterpart scan my node peerID now and create a new transaction tomorrow then it will go in the wrong wallet if i change between this time ?"
In the system's current design, the transaction would not go to the wrong wallet. Instead, the transaction would likely fail to send.

Here’s the reason why:

The Node PeerID, which is what your counterpart gets from the QR code to establish a connection, is temporary or "ephemeral". A new Node PeerID is generated every time your application starts the P2P node.

So, in your scenario:

    - Today: Your counterpart scans the QR code and saves the address of your temporary node (let's call it Node_A).
    - Tomorrow: You restart your app with a different wallet. Your application now has a new temporary node (Node_B). The old Node_A no longer exists on the network.
    - When your counterpart tries to send the transaction, their application will try to connect to the old, non-existent Node_A. The connection will time out, and the transaction will fail.

You have highlighted a key design consideration for this application. While this behavior is "safe" because it prevents funds from going to the wrong wallet, it is not ideal for the user experience, as connection details can become invalid after a restart.

A more advanced version of this system might use your permanent Wallet ID as your main address and then use a discovery service on the network to find which temporary Node ID is currently active for that wallet. For now, the connection would need to be re-established by scanning a new QR code.

### 2 - persistant datastore for the ledger

### 3 - internet relay node 
    - discover all the internet relay to populate node list
    - populate SETRate transaction
    - spread informations
    - 

    


