import { Router, Request, Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebase';

const router = Router();

router.post('/cleanup', async (req: Request, res: Response) => {
  const secret = req.headers['x-cleanup-secret'];
  if (!secret || secret !== process.env.CLEANUP_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const cutoff = Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000));

  const snapshot = await db
    .collection('games')
    .where('lastTurnAt', '<', cutoff)
    .get();

  if (snapshot.empty) {
    res.json({ deleted: 0 });
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  res.json({ deleted: snapshot.size });
});

export default router;
