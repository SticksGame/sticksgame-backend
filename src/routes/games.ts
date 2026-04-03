import { Router } from 'express';
import { randomUUID } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

router.post('/', requireAuth, async (req, res) => {
  const { userEmail } = req as AuthenticatedRequest;

  const gameId = randomUUID();
  const playerId = randomUUID();

  const batch = db.batch();

  batch.set(db.collection('games').doc(gameId), {
    id: gameId,
    userEmail,
    state: 'ready',
    createdAt: FieldValue.serverTimestamp(),
  });

  batch.set(db.collection('players').doc(playerId), {
    id: playerId,
    gameId,
    email: userEmail,
    role: 'owner',
  });

  await batch.commit();

  res.status(201).json({ id: gameId });
});

export default router;
