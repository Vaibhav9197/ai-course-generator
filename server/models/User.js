import mongoose from 'mongoose';
import { registerModel } from './registerModel.js';
import { serializePlugin } from './plugins/serialize.js';

/**
 * A user, identified by their Auth0 `sub` claim.
 *
 * This row is a convenience cache for profile data and preferences — it is NOT the
 * source of truth for identity. Authorisation always uses the `sub` from the verified
 * JWT, so a missing User document can never grant or deny access.
 */
const userSchema = new mongoose.Schema(
  {
    auth0Sub: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    email: { type: String, trim: true, lowercase: true },
    name: { type: String, trim: true },
    picture: { type: String, trim: true },

    prefs: {
      /** When true, lesson pages auto-request the Hinglish explanation. */
      autoTranslateToHinglish: { type: Boolean, default: false },
    },

    /** Rolling counter used alongside express-rate-limit for the daily generation cap. */
    generationCount: { type: Number, default: 0 },
    lastGeneratedAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.plugin(serializePlugin);

/**
 * Upsert from verified JWT claims. Called once per login rather than per request —
 * see docs/ARCHITECTURE.md on why we don't hit Auth0's /userinfo on every call.
 */
userSchema.statics.upsertFromClaims = function upsertFromClaims(claims) {
  const { sub, email, name, picture } = claims;
  return this.findOneAndUpdate(
    { auth0Sub: sub },
    {
      $set: {
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
        ...(picture ? { picture } : {}),
      },
      $setOnInsert: { auth0Sub: sub },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
};

export const User = registerModel('User', userSchema);
export default User;
