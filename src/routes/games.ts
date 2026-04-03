import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db, auth } from '../config/firebase';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const ROWS = [1, 3, 5, 7];

function buildInitialSticks() {
  return ROWS.flatMap((count, row) =>
    Array.from({ length: count }, (_, index) => ({ row, index, crossed: false }))
  );
}

router.post('/', requireAuth, async (req, res) => {
  const { userEmail } = req as AuthenticatedRequest;

  const gameId = randomUUID();
  const playerId = randomUUID();

  const batch = db.batch();

  batch.set(db.collection('games').doc(gameId), {
    id: gameId,
    userEmail,
    guestEmail: null,
    state: 'ready',
    currentTurn: userEmail,
    sticks: buildInitialSticks(),
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

  batch.update(db.collection('games').doc(gameId), {
    state: 'playing',
    guestEmail: userEmail,
    currentTurn: userEmail,
  });

  await batch.commit();

  res.status(201).json({ id: playerId });
});

router.patch('/:gameId/sticks', requireAuth, async (req, res) => {
  const { userEmail } = req as AuthenticatedRequest;
  const gameId = req.params['gameId'] as string;
  const { sticks: selectedSticks } = req.body as {
    sticks: { row: number; index: number }[];
  };

  if (!Array.isArray(selectedSticks) || selectedSticks.length === 0) {
    res.status(400).json({ error: 'Must select at least one stick' });
    return;
  }

  const gameDoc = await db.collection('games').doc(gameId).get();

  if (!gameDoc.exists) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const game = gameDoc.data()!;

  if (game.state !== 'playing') {
    res.status(409).json({ error: 'Game is not in playing state' });
    return;
  }

  if (game.currentTurn !== userEmail) {
    res.status(403).json({ error: 'Not your turn' });
    return;
  }

  const row = selectedSticks[0].row;
  if (!selectedSticks.every((s) => s.row === row)) {
    res.status(400).json({ error: 'All sticks must be in the same row' });
    return;
  }

  const sorted = [...selectedSticks].sort((a, b) => a.index - b.index);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].index !== sorted[i - 1].index + 1) {
      res.status(400).json({ error: 'Sticks must be consecutive' });
      return;
    }
  }

  const currentSticks: { row: number; index: number; crossed: boolean }[] = game.sticks;
  for (const s of selectedSticks) {
    const stick = currentSticks.find((cs) => cs.row === s.row && cs.index === s.index);
    if (stick?.crossed) {
      res.status(400).json({ error: `Stick (row ${s.row}, index ${s.index}) is already crossed` });
      return;
    }
  }

  const updatedSticks = currentSticks.map((stick) => {
    const isCrossed = selectedSticks.some(
      (s) => s.row === stick.row && s.index === stick.index
    );
    return isCrossed ? { ...stick, crossed: true } : stick;
  });

  const nextTurn = game.userEmail === userEmail ? game.guestEmail : game.userEmail;

  await db.collection('games').doc(gameId).update({
    sticks: updatedSticks,
    currentTurn: nextTurn,
  });

  res.json({ ok: true });
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

  const unsubscribe = db
    .collection('games')
    .doc(gameId)
    .onSnapshot(
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
          sticks: game.sticks,
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
    sticks: game.sticks,
    createdAt: game.createdAt,
    isOwner: game.userEmail === userEmail,
  });
});

export default router;
