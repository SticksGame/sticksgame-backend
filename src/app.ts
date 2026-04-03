import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import gamesRouter from './routes/games';

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

app.use('/health', healthRouter);
app.use('/games', gamesRouter);

export default app;
