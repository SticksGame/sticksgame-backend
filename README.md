# SticksGame — Backend

REST API para el juego multijugador **SticksGame** (variante del juego Nim). Construido con **Node.js + Express + TypeScript** y desplegado en **Google Cloud Run**.

---

## Descripción

El backend gestiona la lógica del juego, autenticación de jugadores y comunicación en tiempo real. Cada partida se almacena en **Cloud Firestore** y los jugadores reciben actualizaciones instantáneas del estado del juego mediante **Server-Sent Events (SSE)**.

---

## Stack tecnológico

| Tecnología | Uso |
|---|---|
| Node.js 22 + Express 5 | Servidor HTTP |
| TypeScript | Tipado estático |
| Firebase Admin SDK | Verificación de tokens y acceso a Firestore |
| Cloud Firestore | Base de datos |
| Google Cloud Run | Infraestructura serverless |
| Docker | Containerización |
| Cloud Scheduler | Cron para limpieza de partidas inactivas |

---

## Estructura del proyecto

```
src/
├── app.ts              # Configuración de Express (middlewares, rutas)
├── index.ts            # Punto de entrada, inicia el servidor en el puerto 8080
├── config/
│   └── firebase.ts     # Inicialización de Firebase Admin SDK
├── middleware/
│   └── auth.ts         # Middleware de autenticación con Firebase ID tokens
└── routes/
    ├── health.ts        # GET /health — healthcheck
    ├── games.ts         # Endpoints del juego
    └── admin.ts         # Endpoints administrativos (limpieza de partidas)
```

---

## API Reference

### Autenticación

Todos los endpoints (excepto `/health` y `/games/:gameId/events`) requieren el header:

```
Authorization: Bearer <firebase-id-token>
```

El endpoint SSE recibe el token como query param `?token=` ya que `EventSource` no soporta headers custom.

---

### `POST /games`

Crea una nueva partida. El jugador que la crea es el **owner**.

**Response:**
```json
{
  "id": "uuid-del-juego",
  "playerId": "uuid-del-jugador"
}
```

---

### `POST /games/:gameId/join`

Se une a una partida existente como **guest**. El guest toma el turno inicial.

**Validaciones:**
- La partida debe existir y estar en estado `ready`
- El owner no puede unirse a su propia partida

**Response:**
```json
{ "id": "uuid-del-jugador" }
```

---

### `PATCH /games/:gameId/sticks`

Registra un movimiento: tacha uno o más palitos.

**Body:**
```json
{
  "sticks": [
    { "row": 2, "index": 0 },
    { "row": 2, "index": 1 }
  ]
}
```

**Validaciones:**
- Debe ser el turno del jugador
- Todos los palitos deben estar en la misma fila
- Deben ser consecutivos (índices contiguos)
- No pueden estar ya tachados

**Lógica de fin de juego:**
- Si quedan exactamente 1 palito luego del movimiento → el jugador actual gana (el siguiente está obligado a tachar el último y pierde)
- Si quedan 0 palitos → el jugador que tachó el último pierde

**Response:**
```json
{ "ok": true }
```

---

### `GET /games/:gameId`

Retorna el estado actual de la partida desde la perspectiva del jugador autenticado.

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
    { "id": "uuid", "displayName": "Nombre", "role": "owner" }
  ]
}
```

---

### `GET /games/:gameId/events`

Stream SSE con actualizaciones en tiempo real del estado de la partida.

**Query param:** `?token=<firebase-id-token>`

**Evento emitido ante cada cambio en Firestore:**
```json
{
  "state": "playing",
  "currentPlayerId": "uuid",
  "winnerId": "uuid | null",
  "players": [{ "id": "uuid", "displayName": "Nombre", "role": "owner" }],
  "sticks": [{ "row": 0, "index": 0, "crossed": false }]
}
```

---

### `POST /admin/cleanup`

Elimina partidas cuyo último movimiento fue hace más de 30 minutos. Llamado automáticamente por Cloud Scheduler cada 30 minutos.

**Header requerido:** `x-cleanup-secret: <secret>`

**Response:**
```json
{ "deleted": 3 }
```

---

## Estructura del documento de juego en Firestore

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

La pirámide tiene **16 palitos** distribuidos en 4 filas: 1 – 3 – 5 – 7.

---

## Variables de entorno

| Variable | Descripción |
|---|---|
| `FIREBASE_PROJECT_ID` | ID del proyecto de Firebase |
| `FIREBASE_CLIENT_EMAIL` | Email de la service account |
| `FIREBASE_PRIVATE_KEY` | Clave privada de la service account |
| `CORS_ORIGIN` | Origen permitido para CORS (default: `http://localhost:5173`) |
| `CLEANUP_SECRET` | Secret para el endpoint `/admin/cleanup` |

Crear un archivo `.env` en la raíz del proyecto con estas variables para desarrollo local.

---

## Desarrollo local

```bash
npm install
npm run dev       # Servidor en http://localhost:8080 con hot reload
```

## Build y producción

```bash
npm run build     # Compila TypeScript a dist/
npm start         # Corre el servidor compilado
```

## Deploy a Cloud Run

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

**URL de producción:** `https://sticksgame-backend-1042398775879.us-central1.run.app`
