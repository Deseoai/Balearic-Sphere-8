# Balea Sphere Mobile App

## Quick Start (Test on iPhone NOW — no Apple account needed)

### 1. Install on your Mac
```bash
cd apps/mobile
npm install
```

### 2. Start the dev server
```bash
npx expo start
```

### 3. Scan QR code with your iPhone
- Install **Expo Go** from App Store first
- Open Camera app → scan QR code in terminal
- App opens instantly on your iPhone

---

## App Store Deployment (when Apple Developer account is ready)

### Prerequisites
- Apple Developer account ($99/year) → developer.apple.com
- Expo account (free) → expo.dev

### One-time setup
```bash
npm install -g eas-cli
eas login
eas build:configure
```

### Build for App Store
```bash
eas build --platform ios --profile production
```

### Submit to App Store
```bash
eas submit --platform ios
```

---

## Features
- Login via Magic Link (email)
- Workspace Dashboard (credits, scores)
- Network — member list + send intros
- Messages — direct chat
- Events — browse, create, RSVP
- Marketplace — browse + create listings
- Credits — balance + Stripe top-up
- Elite Circle — exclusive member chat (elite only)
- AI Tools — 8 GPT-powered analyses (uses real platform data)
- Settings — profile edit, avatar upload, sign out
