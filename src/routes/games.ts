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

router.post('/:gameId/join', requireAuth, async (req, res) => {
  const { userEmail } = req as AuthenticatedRequest;
  const gameId = req.params['gameId'] as string;

  const gameDoc = await db.collection('games').doc(gameId).get();

  if (!gameDoc.exists) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const game = gameDoc.data()!;

  if (game.state !== 'ready') {
    res.status(409).json({ error: 'Game is not in ready state' });
    return;
  }

  if (game.userEmail === userEmail) {
    res.status(409).json({ error: 'Owner cannot join their own game as guest' });
    return;
  }

  const playerId = randomUUID();

  await db.collection('players').doc(playerId).set({
    id: playerId,
    gameId,
    email: userEmail,
    role: 'guest',
  });

  res.status(201).json({ id: playerId });
});

router.get('/:gameId', requireAuth, async (req, res) => {
  const { userEmail } = req as AuthenticatedRequest;
  const gameId = req.params['gameId'] as string;

  const doc = await db.collection('games').doc(gameId).get();

  if (!doc.exists) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const game = doc.data()!;

  res.json({
    id: game.id,
    state: game.state,
    createdAt: game.createdAt,
    isOwner: game.userEmail === userEmail,
  });
});

export default router;
