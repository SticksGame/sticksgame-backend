# SticksGame — Backend

REST API for the **SticksGame** multiplayer game (a variant of the Nim game). Built with **Node.js + Express + TypeScript** and deployed to **Google Cloud Run**.

---

## Overview

The backend handles game logic, player authentication, and real-time communication. Each game is stored in **Cloud Firestore** and players receive instant game state updates via **Server-Sent Events (SSE)**.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| Node.js 22 + Express 5 | HTTP server |
| TypeScript | Static typing |
| Firebase Admin SDK | Token verification and Firestore access |
| Cloud Firestore | Database |
| Google Cloud Run | Serverless infrastructure |
| Docker | Containerization |
| Cloud Scheduler | Cron job to clean up inactive games |

---

## Project Structure

```
src/
├── app.ts              # Express setup (middlewares, routes)
├── index.ts            # Entry point, starts the server on port 8080
├── config/
│   └── firebase.ts     # Firebase Admin SDK initialization
├── middleware/
│   └── auth.ts         # Authentication middleware using Firebase ID tokens
└── routes/
    ├── health.ts        # GET /health — healthcheck
    ├── games.ts         # Game endpoints
    └── admin.ts         # Admin endpoints (stale game cleanup)
```

---

## API Reference

### Authentication

All endpoints (except `/health` and `/games/:gameId/events`) require the header:

```
Authorization: Bearer <firebase-id-token>
```

The SSE endpoint receives the token as a `?token=` query param since `EventSource` does not support custom headers.

---

### `POST /games`

Creates a new game. The authenticated user becomes the **owner**.

**Response:**
```json
{
  "id": "game-uuid",
  "playerId": "player-uuid"
}
```

---

### `POST /games/:gameId/join`

Joins an existing game as **guest**. The guest takes the first turn.

**Validations:**
- Game must exist and be in `ready` state
- The owner cannot join their own game as a guest

**Response:**
```json
{ "id": "player-uuid" }
```

---

### `PATCH /games/:gameId/sticks`

Registers a move: crosses out one or more sticks.

**Body:**
```json
{
  "sticks": [
    { "row": 2, "index": 0 },
    { "row": 2, "index": 1 }
  ]
}
```

**Validations:**
- Must be the player's turn
- All sticks must be in the same row
- Sticks must be consecutive (contiguous indices)
- Sticks must not already be crossed

**End-of-game logic:**
- If exactly 1 stick remains after the move → current player wins (next player is forced to cross the last one and loses)
- If 0 sticks remain → current player loses (they crossed the last stick)

**Response:**
```json
{ "ok": true }
```

---

### `GET /games/:gameId`

Returns the current game state from the perspective of the authenticated player.

**Response:**
```json
{
  "id": "uuid",
  "state": "ready | playing | finished",
  "currentPlayerId": "uuid | null",
  "sticks": [{ "row": 0, "index": 0, "crossed": false }],
  "createdAt": "timestamp",
  "isOwner": true,
  "myPlayerId": "uuid",
  "players": [
    { "id": "uuid", "displayName": "Name", "role": "owner" }
  ]
}
```

---

### `GET /games/:gameId/events`

SSE stream with real-time game state updates.

**Query param:** `?token=<firebase-id-token>`

**Event emitted on every Firestore change:**
```json
{
  "state": "playing",
  "currentPlayerId": "uuid",
  "winnerId": "uuid | null",
  "players": [{ "id": "uuid", "displayName": "Name", "role": "owner" }],
  "sticks": [{ "row": 0, "index": 0, "crossed": false }]
}
```

---

### `POST /admin/cleanup`

Deletes games whose last move was more than 30 minutes ago. Called automatically by Cloud Scheduler every 30 minutes.

**Required header:** `x-cleanup-secret: <secret>`

**Response:**
```json
{ "deleted": 3 }
```

---

## Firestore Game Document Structure

```json
{
  "id": "uuid",
  "state": "ready | playing | finished",
  "currentPlayerId": "uuid | null",
  "winnerId": "uuid | null",
  "lastTurnAt": "timestamp",
  "createdAt": "timestamp",
  "sticks": [
    { "row": 0, "index": 0, "crossed": false },
    { "row": 1, "index": 0, "crossed": false },
    { "row": 1, "index": 1, "crossed": false }
  ],
  "players": [
    { "id": "uuid", "email": "...", "displayName": "...", "role": "owner" },
    { "id": "uuid", "email": "...", "displayName": "...", "role": "guest" }
  ]
}
```

The pyramid has **16 sticks** across 4 rows: 1 – 3 – 5 – 7.

---

## Environment Variables

| Variable | Description |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Service account private key |
| `CORS_ORIGIN` | Allowed CORS origin (default: `http://localhost:5173`) |
| `CLEANUP_SECRET` | Secret for the `/admin/cleanup` endpoint |

Create a `.env` file in the project root with these variables for local development.

---

## Local Development

```bash
npm install
npm run dev       # Server at http://localhost:8080 with hot reload
```

## Build & Production

```bash
npm run build     # Compile TypeScript to dist/
npm start         # Run the compiled server
```

## Deploy to Cloud Run

```bash
gcloud run deploy sticksgame-backend \
  --source . \
  --project sticksgame-prod \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "FIREBASE_PROJECT_ID=...,FIREBASE_CLIENT_EMAIL=...,CLEANUP_SECRET=..." \
  --set-env-vars "^||^FIREBASE_PRIVATE_KEY=..."
```

**Production URL:** `https://sticksgame-backend-1042398775879.us-central1.run.app`
