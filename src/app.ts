import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import gamesRouter from './routes/games';
import adminRouter from './routes/admin';

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  }
}));
app.use(express.json());

app.use('/health', healthRouter);
app.use('/games', gamesRouter);
app.use('/admin', adminRouter);

export default app;
