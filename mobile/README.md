# BeatBuzz Mobile App

React Native (Expo) mobile app for the BeatBuzz social platform.

## Setup

### 1. Install dependencies
```
cd mobile
npm install
```

### 2. Configure backend URL
Edit `src/config.js`:
- **Android Emulator**: `http://10.0.2.2:5000` (default)
- **Physical Android phone**: Change to your PC's local IP, e.g. `http://192.168.1.5:5000`

> Find your PC's IP: Run `ipconfig` in cmd → look for "IPv4 Address" under your WiFi adapter

### 3. Start development server (Expo Go testing)
```
npx expo start
```
Scan the QR code with the **Expo Go** app on your phone.

### 4. Build APK (requires Expo account)

**Step 1**: Create a free account at https://expo.dev

**Step 2**: Login via CLI:
```
npx eas-cli login
```

**Step 3**: Build the APK:
```
npx eas-cli build -p android --profile preview
```

The APK will be built in the cloud and a download link provided. No Android Studio needed!

## Features
- 🔐 Login / Register / OTP Verification
- 🧭 Explore profiles with Vibe (follow) system
- 📖 Stories with full-screen viewer
- 🖼 Posts feed (images + thoughts) with likes & comments
- 💬 Real-time chat
- 🔔 Notifications
- 🔍 User search
- 👤 Editable profile with photo upload
- 🤝 Connections management
