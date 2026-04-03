import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db } from '../config/firebase';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

router.post('/', requireAuth, async (req, res) => {
  const { userEmail } = req as AuthenticatedRequest;

  const id = randomUUID();

  await db.collection('games').doc(id).set({
    id,
    userEmail,
    createdAt: new Date().toISOString(),
  });

  res.status(201).json({ id });
});

export default router;
