# invectis
p2p earth ressources tr

### Launch nodes :
```node index.js wallet1.dat```

It may copy on the clipboard the adress to connect 
```node index.js wallet1.dat [ADRESS_TO_CONNECT]```

use ```_Lance-Noeud-1.bat``` or ```_Lance-Noeud-2.bat``` to launch nodes. Or use ```_Lance-Test-Connexion.bat``` to test connection after launching node 1.



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
