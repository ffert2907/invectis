#!/bin/bash
# This script builds the web app and syncs it with the Android project.

# Install dependencies (if not already installed)
npm install

# Build the web app
npm run build

# Sync the web app with the Android project
npx cap sync android
