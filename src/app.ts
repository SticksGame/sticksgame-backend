import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import gamesRouter from './routes/games';
import adminRouter from './routes/admin';

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

app.use('/health', healthRouter);
app.use('/games', gamesRouter);
app.use('/admin', adminRouter);

export default app;
