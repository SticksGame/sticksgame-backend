import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db, auth } from '../config/firebase';
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
    currentTurn: userEmail,
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

  const batch = db.batch();

  batch.set(db.collection('players').doc(playerId), {
    id: playerId,
    gameId,
    email: userEmail,
    role: 'guest',
  });

  batch.update(db.collection('games').doc(gameId), { state: 'playing' });
  await batch.commit();

  res.status(201).json({ id: playerId });
});

router.get('/:gameId/events', async (req: Request, res: Response) => {
  const gameId = req.params['gameId'] as string;
  const token = req.query['token'] as string | undefined;

  if (!token) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  let userEmail: string;
  try {
    const decoded = await auth.verifyIdToken(token);
    userEmail = decoded.email ?? '';
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const unsubscribe = db.collection('games').doc(gameId).onSnapshot(
    (snapshot) => {
      if (!snapshot.exists) {
        sendEvent({ error: 'Game not found' });
        res.end();
        return;
      }
      const game = snapshot.data()!;
      sendEvent({
        state: game.state,
        currentTurn: game.currentTurn,
        isMyTurn: game.currentTurn === userEmail,
      });
    },
    (error) => {
      console.error('Firestore onSnapshot error:', error);
      res.end();
    }
  );

  req.on('close', () => {
    unsubscribe();
  });
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
    currentTurn: game.currentTurn,
    createdAt: game.createdAt,
    isOwner: game.userEmail === userEmail,
  });
});

export default router;
