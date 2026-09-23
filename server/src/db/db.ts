// Database layer: SQLite via the built-in node:sqlite module (no native deps).
// Structured tables per the EnhanceCV data model:
//   User → MasterProfile, MasterResume, JobDescriptions, JobAnalyses,
//          ATSAnalyses, MatchAnalyses, TailoringRuns, ResumeVersions

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  db = new DatabaseSync(path.join(dataDir, 'enhancecv.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

export function getDbForTests(): DatabaseSync {
  const fresh = new DatabaseSync(':memory:');
  fresh.exec('PRAGMA foreign_keys = ON;');
  migrate(fresh);
  return fresh;
}

function migrate(d: DatabaseSync): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      target_role TEXT NOT NULL DEFAULT '',
      onboarded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('master','tailored')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,            -- ResumeData JSON
      job_id TEXT,                      -- for tailored versions
      ats_score INTEGER,                -- cached ATS score at last computation
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id);

    CREATE TABLE IF NOT EXISTS job_descriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      raw_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_user ON job_descriptions(user_id);

    CREATE TABLE IF NOT EXISTS job_analyses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
      analysis TEXT NOT NULL,           -- JobAnalysis JSON
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_job_analyses_user ON job_analyses(user_id);

    CREATE TABLE IF NOT EXISTS ats_analyses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      analysis TEXT NOT NULL,           -- ATSAnalysis JSON
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ats_analyses_resume ON ats_analyses(resume_id);

    CREATE TABLE IF NOT EXISTS match_analyses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
      master_resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      analysis TEXT NOT NULL,           -- MatchAnalysis JSON
      score INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_match_analyses_user ON match_analyses(user_id);

    CREATE TABLE IF NOT EXISTS tailoring_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
      match_analysis_id TEXT,
      version_id TEXT NOT NULL,         -- resulting ResumeVersion
      before_ats INTEGER NOT NULL,
      after_ats INTEGER NOT NULL,
      before_match INTEGER NOT NULL,
      after_match INTEGER NOT NULL,
      truth_passed INTEGER NOT NULL,
      change_log TEXT NOT NULL,         -- ChangeLogEntry[] JSON
      truth_report TEXT NOT NULL,       -- TruthReport JSON
      keyword_coverage_before INTEGER NOT NULL,
      keyword_coverage_after INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_runs_user ON tailoring_runs(user_id);
  `);
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
