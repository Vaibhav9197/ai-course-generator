import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { getMe, updateMe } from '../controllers/user.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', getMe);
router.patch('/', updateMe);

export default router;
