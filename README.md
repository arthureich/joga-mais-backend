# Joga Plus Backend

## Description
Firebase Cloud Functions backend for the Joga Mais TCC/capstone app. The functions watch Firestore events and send Firebase Cloud Messaging notifications for sports-event and team workflows, such as users joining events, event requests, approvals, cancellations, team invites, and related status changes.

## Tech Stack
- TypeScript
- JavaScript build output
- Node.js
- Firebase Functions
- Firebase Admin SDK
- Cloud Firestore
- Firebase Cloud Messaging

## Structure
- `functions/src/index.ts` contains the Cloud Functions source.
- `functions/lib/` contains compiled JavaScript output.
- `firebase.json` and `.firebaserc` hold Firebase project configuration.
- `functions/package.json` defines the build and Firebase Functions dependencies.

## How to Run
From the backend folder:

```bash
cd functions
npm install
npm run build
```

Deployment requires a configured Firebase project and Firebase CLI login.
