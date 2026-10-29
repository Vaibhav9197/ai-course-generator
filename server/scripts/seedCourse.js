/**
 * Seeds one fixture course so the frontend and route tests have realistic data to work
 * against without spending Gemini tokens.
 *
 *   npm run seed              # insert (skips if the seed course already exists)
 *   npm run seed -- --force   # delete any existing seed courses first
 *
 * Requires MONGO_URI in server/.env.
 */
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { Course, Lesson } from '../models/index.js';
import { createCourseTree, deleteCourseTree } from '../services/courseTree.service.js';
import { sampleOutline, enrichedLessons, SEED_CREATOR } from '../fixtures/sampleCourse.js';

async function seed({ force }) {
  if (!env.mongoUri) {
    throw new Error(
      'MONGO_URI is not set. Copy server/.env.example to server/.env and add your ' +
        'MongoDB Atlas connection string.',
    );
  }

  await connectDb();

  // Matched on title as well as creator: without Auth0, every course a developer generates is
  // also owned by SEED_CREATOR (the dev identity), and --force must never delete those.
  const existing = await Course.find({
    creator: SEED_CREATOR,
    title: sampleOutline.title,
  }).select('_id title');

  if (existing.length && !force) {
    console.log(
      `[seed] ${existing.length} seed course(s) already present. ` +
        'Re-run with --force to replace them.',
    );
    existing.forEach((course) => console.log(`       · ${course.title} (${course._id})`));
    return;
  }

  if (existing.length) {
    for (const course of existing) {
      await deleteCourseTree(course._id, SEED_CREATOR);
    }
    console.log(`[seed] removed ${existing.length} existing seed course(s)`);
  }

  const course = await createCourseTree({
    creator: SEED_CREATOR,
    outline: sampleOutline,
    topicPrompt: 'Intro to React Hooks',
  });

  // Apply the hand-written enriched content to the lessons that have it, leaving the rest
  // as stubs so the UI's not-yet-generated path is exercised too.
  let enrichedCount = 0;
  for (const [title, payload] of Object.entries(enrichedLessons)) {
    // Scoped to this course's modules — a bare title match could hit an identically
    // titled lesson in someone else's course.
    const lesson = await Lesson.findOne({ title, module: { $in: course.modules } });
    if (!lesson) {
      console.warn(`[seed] no lesson found titled "${title}" — fixture titles are out of sync`);
      continue;
    }
    await lesson.applyEnrichment(payload);
    enrichedCount += 1;
  }

  const totalLessons = await Lesson.countDocuments({
    module: { $in: course.modules },
  });

  console.log('[seed] done');
  console.log(`       course   ${course.title} (${course._id})`);
  console.log(`       creator  ${SEED_CREATOR}`);
  console.log(`       modules  ${course.modules.length}`);
  console.log(`       lessons  ${totalLessons} (${enrichedCount} enriched, rest are stubs)`);
}

const force = process.argv.includes('--force');

seed({ force })
  .then(() => disconnectDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[seed] failed:', err.message);
    if (mongoose.connection.readyState) await disconnectDb().catch(() => {});
    process.exit(1);
  });
