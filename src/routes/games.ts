import { Router } from 'express';
import { randomUUID } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

router.post('/', requireAuth, async (req, res) => {
  const { userEmail } = req as AuthenticatedRequest;

  const id = randomUUID();

  await db.collection('games').doc(id).set({
    id,
    userEmail,
    state: 'ready',
    createdAt: FieldValue.serverTimestamp(),
  });

  res.status(201).json({ id });
});

export default router;
