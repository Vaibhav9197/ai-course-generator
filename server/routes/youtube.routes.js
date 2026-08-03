import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { searchVideo } from '../controllers/youtube.controller.js';

const router = Router();

// Authenticated so the proxy cannot be used as a free public YouTube search API against
// our quota.
router.use(requireAuth);

router.get('/search', searchVideo);

export default router;
