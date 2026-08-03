import { User } from '../models/index.js';
import { currentUserSub, currentUserClaims } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/ApiError.js';

/**
 * GET /api/me
 *
 * Returns (and lazily creates) the caller's profile row. The frontend calls this once
 * after login, which is what performs the first-login upsert — identity itself always
 * comes from the verified JWT, so a missing row can never affect authorisation.
 */
export const getMe = asyncHandler(async (req, res) => {
  const claims = currentUserClaims(req);
  const user = await User.upsertFromClaims(claims);

  res.json({ user: publicUser(user) });
});

/**
 * PATCH /api/me
 * Body: { prefs: { autoTranslateToHinglish } }
 */
export const updateMe = asyncHandler(async (req, res) => {
  const sub = currentUserSub(req);
  const { prefs } = req.body ?? {};

  const update = {};
  if (prefs && typeof prefs.autoTranslateToHinglish === 'boolean') {
    update['prefs.autoTranslateToHinglish'] = prefs.autoTranslateToHinglish;
  }

  const user = await User.findOneAndUpdate(
    { auth0Sub: sub },
    { $set: update, $setOnInsert: { auth0Sub: sub } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  res.json({ user: publicUser(user) });
});

/** Whitelists what leaves the server — never spread a Mongoose document into a response. */
function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    prefs: {
      autoTranslateToHinglish: Boolean(user.prefs?.autoTranslateToHinglish),
    },
  };
}
