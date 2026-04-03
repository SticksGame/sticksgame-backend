# Copilot Instructions

## Stack

Node.js 22, Express, TypeScript (strict), Firebase Admin SDK (Firestore), deployed to GCP Cloud Run

## Commands

```bash
npm run dev      # Start dev server with hot-reload (ts-node-dev) at port 8080
npm run build    # Compile TypeScript to dist/
npm run start    # Run compiled output (production)
```

## Project structure

```
src/
├── config/       # Firebase Admin SDK initialisation
├── routes/       # Express route handlers
├── middleware/   # Express middleware
└── index.ts      # Entry point
```

## Cloud Run conventions

- The server **must** read the port from `process.env.PORT` (Cloud Run injects this, defaults to `8080`)
- Keep the container stateless — all persistent state goes to Firestore
- The `Dockerfile` uses a two-stage build: compile in `builder`, run lean in `runner`

## Firestore

- Firebase Admin SDK is initialised once in `src/config/firebase.ts` and exported as `db`
- Credentials are injected via environment variables: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- Never commit credentials — use `.env` locally (gitignored) and Secret Manager on Cloud Run

## Language

All code, comments, variable names, and commit messages must be written in **English**.
