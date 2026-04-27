# BeatBuzz

BeatBuzz is a comprehensive full-stack social networking application. It features a React Native (Expo) mobile frontend and a robust Node.js/Express backend. BeatBuzz allows users to connect with others, share their thoughts and images, view stories, and chat in real-time.

## 🌟 Features

- **Authentication System**: Secure Login, Registration, and OTP-based email verification using Nodemailer.
- **Vibe System**: Follow/unfollow mechanism to build your network.
- **Stories**: Full-screen story viewer for ephemeral content.
- **Feed & Posts**: Share visual posts (images) and textual posts (thoughts) with interactive likes and comments.
- **Real-time Chat**: Engage in conversations with your connections.
- **Notifications**: Stay updated when someone interacts with your posts or profile.
- **User Discovery**: Search for users and explore profiles.
- **Profile Management**: Customizable profiles including avatar uploads and "My Posts" gallery.
- **Cloud Storage Integration**: Handles media uploads using MEGA cloud storage and local systems.

## 🛠️ Tech Stack

### Frontend (Mobile App)
- **Framework**: React Native (Expo)
- **Navigation**: React Navigation
- **Networking**: Axios / Fetch API

### Backend (Server)
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL (using `mysql2`)
- **Authentication**: Bcrypt for password hashing, Express-session
- **File Uploads**: Multer
- **Storage**: MEGA.nz (via `megajs`)
- **Email Service**: Nodemailer (for OTP)

## 🚀 Getting Started

### Prerequisites
- Node.js installed
- MySQL Server running locally or remotely
- Expo Go app on your mobile device (for testing)

### Backend Setup

1. **Navigate to the root directory and install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Create a `.env` file in the root directory and add the required configurations:
   ```env
   DB_HOST=localhost
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password
   DB_NAME=your_db_name
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_email_app_password
   # Add MEGA credentials if applicable
   ```

3. **Start the backend server:**
   ```bash
   npm start
   # or
   npm run dev
   ```

### Frontend Setup

1. **Navigate to the mobile directory:**
   ```bash
   cd mobile
   npm install
   ```

2. **Configure the API URL:**
   Edit `mobile/src/config.js` to point to your backend IP.
   - For Android Emulator: `http://10.0.2.2:5000`
   - For physical device: Use your computer's local IP address (e.g., `http://192.168.1.5:5000`)

3. **Start the Expo development server:**
   ```bash
   npx expo start
   ```
   *Scan the QR code with the Expo Go app on your phone to launch the app.*

## 📦 Building the APK

You can build a standalone Android APK using EAS CLI:
```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

## 📜 License
This project is licensed under the ISC License.
