import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'app.db'));
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('student','teacher')),
  paid_until TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  tier TEXT,
  year INTEGER NOT NULL,
  formula_json TEXT NOT NULL,
  source_note TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  UNIQUE(name, year)
);
CREATE TABLE IF NOT EXISTS majors (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  plan_num INTEGER,
  xuekao_req TEXT NOT NULL,
  subject_req TEXT,
  body_req_json TEXT,
  test_form TEXT,
  outline_status TEXT NOT NULL DEFAULT 'unpublished',
  outline_text TEXT,
  cutoff_score REAL,
  cutoff_year INTEGER,
  composite_rule TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  FOREIGN KEY(school_id) REFERENCES schools(id)
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY,
  major_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('history','current')),
  module TEXT,
  stem TEXT NOT NULL,
  options_json TEXT NOT NULL,
  answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','published')),
  origin TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(major_id) REFERENCES majors(id)
);
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  profile_json TEXT NOT NULL,
  results_json TEXT NOT NULL,
  llm_overview TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS trial_sets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  major_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  question_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, major_id, kind)
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  choice TEXT NOT NULL,
  correct INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  school_id INTEGER,
  year INTEGER,
  doc_type TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  extract_json TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

function hasColumn(table, name) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === name);
}
if (!hasColumn('majors', 'audience')) db.exec("ALTER TABLE majors ADD COLUMN audience TEXT NOT NULL DEFAULT '不限'");
if (!hasColumn('majors', 'cooperation')) db.exec('ALTER TABLE majors ADD COLUMN cooperation INTEGER NOT NULL DEFAULT 0');
if (!hasColumn('majors', 'color_req')) db.exec("ALTER TABLE majors ADD COLUMN color_req TEXT NOT NULL DEFAULT ''");
if (!hasColumn('questions', 'qtype')) db.exec("ALTER TABLE questions ADD COLUMN qtype TEXT NOT NULL DEFAULT 'single'");
db.exec(`
CREATE TABLE IF NOT EXISTS papers (
  id INTEGER PRIMARY KEY,
  major_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  year INTEGER,
  minutes INTEGER NOT NULL DEFAULT 40,
  question_ids_json TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
`);

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, 'hex');
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

export function nowIso() {
  return new Date().toISOString();
}

export function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row && row.value) return row.value;
  return process.env[key] || fallback;
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}
