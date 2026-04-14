import * as SQLite from 'expo-sqlite';

// ─────────────────────────────────────────────────────────────────────────────
//  SINGLETON CONNECTION
//
//  expo-sqlite's openDatabaseAsync is NOT safe to call on every operation —
//  on Android it can return a null handle if called concurrently, causing
//  NativeDatabase.prepareAsync → NullPointerException.
//
//  We open the DB exactly once and reuse the same handle everywhere.
// ─────────────────────────────────────────────────────────────────────────────
let _db: SQLite.SQLiteDatabase | null = null;
let _opening: Promise<SQLite.SQLiteDatabase> | null = null;

const getDb = (): Promise<SQLite.SQLiteDatabase> => {
  if (_db) return Promise.resolve(_db);
  if (_opening) return _opening;
  _opening = SQLite.openDatabaseAsync('explainify_multiuser.db').then((db) => {
    _db = db;
    _opening = null;
    return db;
  });
  return _opening;
};

// ─────────────────────────────────────────────────────────────────────────────
//  SCHEMA
// ─────────────────────────────────────────────────────────────────────────────
export const initializeDatabase = async (): Promise<void> => {
  try {
    const db = await getDb();
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        username           TEXT    NOT NULL,
        email              TEXT    UNIQUE NOT NULL,
        password           TEXT    NOT NULL,
        preferred_language TEXT    DEFAULT 'en',
        created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_pdfs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL,
        file_name   TEXT    NOT NULL,
        file_uri    TEXT    NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      -- study_count = how many times user has revisited this topic
      CREATE TABLE IF NOT EXISTS topics_studied (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       INTEGER NOT NULL,
        topic_name    TEXT    NOT NULL,
        study_count   INTEGER DEFAULT 1,
        last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, topic_name),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS quiz_scores (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL,
        topic_name      TEXT    NOT NULL,
        score           INTEGER NOT NULL,
        total_questions INTEGER NOT NULL,
        attempt_date    DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      -- Persistent chat log — one continuous thread per user
      CREATE TABLE IF NOT EXISTS chat_messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        role       TEXT    NOT NULL CHECK(role IN ('user','ai')),
        content    TEXT    NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      -- One row per calendar day per user — powers streak calculation
      CREATE TABLE IF NOT EXISTS study_days (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        study_date TEXT    NOT NULL,
        UNIQUE(user_id, study_date),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    // Safe migrations for existing installs
    for (const sql of [
      `ALTER TABLE users ADD COLUMN preferred_language TEXT DEFAULT 'en';`,
      `ALTER TABLE topics_studied ADD COLUMN study_count INTEGER DEFAULT 1;`,
    ]) {
      try { await db.execAsync(sql); } catch (_) { /* already exists */ }
    }

    console.log('✅ DB ready.');
  } catch (e) {
    console.error('🚨 DB init failed:', e);
    throw e;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────────────────────────────────────
export const registerUser = async (
  username: string, email: string, password: string,
): Promise<{ success: true; userId: number } | { success: false; error: string }> => {
  try {
    const db = await getDb();
    const r = await db.runAsync(
      `INSERT INTO users (username, email, password) VALUES (?, ?, ?);`,
      [username, email.toLowerCase().trim(), password],
    );
    return { success: true, userId: r.lastInsertRowId as number };
  } catch {
    return { success: false, error: 'That email is already registered.' };
  }
};

export const loginUser = async (
  email: string, password: string,
): Promise<{ success: true; user: DBUser } | { success: false; error: string }> => {
  try {
    const db = await getDb();
    const user = await db.getFirstAsync<DBUser>(
      `SELECT * FROM users WHERE email = ? AND password = ?;`,
      [email.toLowerCase().trim(), password],
    );
    return user ? { success: true, user } : { success: false, error: 'Incorrect email or password.' };
  } catch {
    return { success: false, error: 'A database error occurred.' };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  RESOURCE VAULT
// ─────────────────────────────────────────────────────────────────────────────
export const saveUserPdf = async (userId: number, fileName: string, fileUri: string): Promise<void> => {
  try {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO user_pdfs (user_id, file_name, file_uri) VALUES (?, ?, ?);`,
      [userId, fileName, fileUri],
    );
  } catch (e) { console.error('🚨 saveUserPdf:', e); }
};

export const getUserPdfs = async (userId: number): Promise<DBPdf[]> => {
  try {
    const db = await getDb();
    return await db.getAllAsync<DBPdf>(
      `SELECT * FROM user_pdfs WHERE user_id = ? ORDER BY uploaded_at DESC;`, [userId],
    );
  } catch { return []; }
};

export const deleteUserPdf = async (pdfId: number): Promise<void> => {
  const db = await getDb();
  await db.runAsync(`DELETE FROM user_pdfs WHERE id = ?;`, [pdfId]);
};

// ─────────────────────────────────────────────────────────────────────────────
//  STUDY TRACKER
// ─────────────────────────────────────────────────────────────────────────────
export const markTopicAsStudied = async (userId: number, topicName: string): Promise<void> => {
  try {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO topics_studied (user_id, topic_name, study_count, last_accessed)
       VALUES (?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, topic_name)
       DO UPDATE SET study_count = study_count + 1, last_accessed = CURRENT_TIMESTAMP;`,
      [userId, topicName],
    );
    await _recordStudyDay(userId);
  } catch (e) { console.error('🚨 markTopicAsStudied:', e); }
};

export const getStudiedTopicsForUser = async (userId: number): Promise<DBStudiedTopic[]> => {
  try {
    const db = await getDb();
    return await db.getAllAsync<DBStudiedTopic>(
      `SELECT topic_name, study_count, last_accessed
       FROM topics_studied WHERE user_id = ? ORDER BY last_accessed DESC;`,
      [userId],
    );
  } catch { return []; }
};

// ─────────────────────────────────────────────────────────────────────────────
//  QUIZ SCORES
// ─────────────────────────────────────────────────────────────────────────────
export const saveQuizScore = async (
  userId: number, topicName: string, score: number, totalQuestions: number,
): Promise<void> => {
  try {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO quiz_scores (user_id, topic_name, score, total_questions) VALUES (?, ?, ?, ?);`,
      [userId, topicName, score, totalQuestions],
    );
    await _recordStudyDay(userId);
  } catch (e) { console.error('🚨 saveQuizScore:', e); }
};

export const getUserAnalytics = async (userId: number): Promise<DBQuizScore[]> => {
  try {
    const db = await getDb();
    return await db.getAllAsync<DBQuizScore>(
      `SELECT * FROM quiz_scores WHERE user_id = ? ORDER BY attempt_date ASC;`, [userId],
    );
  } catch { return []; }
};

// ─────────────────────────────────────────────────────────────────────────────
//  CHAT HISTORY
// ─────────────────────────────────────────────────────────────────────────────
export const saveChatMessage = async (
  userId: number, role: 'user' | 'ai', content: string,
): Promise<void> => {
  try {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO chat_messages (user_id, role, content) VALUES (?, ?, ?);`,
      [userId, role, content],
    );
  } catch (e) { console.error('🚨 saveChatMessage:', e); }
};

export const getChatHistory = async (userId: number): Promise<DBChatMessage[]> => {
  try {
    const db = await getDb();
    return await db.getAllAsync<DBChatMessage>(
      `SELECT * FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC;`, [userId],
    );
  } catch { return []; }
};

export const clearChatHistory = async (userId: number): Promise<void> => {
  try {
    const db = await getDb();
    await db.runAsync(`DELETE FROM chat_messages WHERE user_id = ?;`, [userId]);
  } catch (e) { console.error('🚨 clearChatHistory:', e); }
};

// ─────────────────────────────────────────────────────────────────────────────
//  STREAK
// ─────────────────────────────────────────────────────────────────────────────
const _recordStudyDay = async (userId: number): Promise<void> => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR IGNORE INTO study_days (user_id, study_date) VALUES (?, ?);`,
      [userId, today],
    );
  } catch (e) { console.error('🚨 _recordStudyDay:', e); }
};

// Shared streak calculator — walks study_days and returns consecutive runs
const _calcStreakRuns = (rows: { study_date: string }[]): number[] => {
  const runs: number[] = [];
  let runLen = 0;
  let expected: Date | null = null;
  for (const row of rows) {
    const d = new Date(row.study_date);
    d.setHours(0, 0, 0, 0);
    if (expected === null || d.getTime() === expected.getTime()) {
      runLen++;
      expected = new Date(d);
      expected.setDate(expected.getDate() - 1);
    } else {
      runs.push(runLen);
      runLen = 1;
      expected = new Date(d);
      expected.setDate(expected.getDate() - 1);
    }
  }
  if (runLen > 0) runs.push(runLen);
  return runs;
};

/** Returns the current active streak in days (0 if broken). */
export const getUserStreak = async (userId: number): Promise<number> => {
  const info = await getStreakInfo(userId);
  return info.current;
};

/**
 * Returns both the current streak and the previous streak length.
 * lastStreak is non-zero only when the current streak is 0 (just broke)
 * so the UI can show "your last streak was X days".
 */
export const getStreakInfo = async (
  userId: number,
): Promise<{ current: number; lastStreak: number }> => {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ study_date: string }>(
      `SELECT study_date FROM study_days WHERE user_id = ? ORDER BY study_date DESC;`,
      [userId],
    );
    if (rows.length === 0) return { current: 0, lastStreak: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const latest = new Date(rows[0].study_date);
    latest.setHours(0, 0, 0, 0);
    const gapDays = (today.getTime() - latest.getTime()) / 86_400_000;

    const runs = _calcStreakRuns(rows);
    const current = gapDays <= 1 ? (runs[0] ?? 0) : 0;
    // Only surface lastStreak when the streak is currently broken
    const lastStreak = current === 0 ? (runs[0] ?? 0) : 0;

    return { current, lastStreak };
  } catch { return { current: 0, lastStreak: 0 }; }
};

// ─────────────────────────────────────────────────────────────────────────────
//  SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
export const updateUserLanguage = async (userId: number, langCode: string): Promise<boolean> => {
  if (!userId || !langCode) return false;
  try {
    const db = await getDb();
    await db.runAsync(`UPDATE users SET preferred_language = ? WHERE id = ?;`, [langCode, userId]);
    return true;
  } catch { return false; }
};

// ─────────────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface DBUser {
  id: number; username: string; email: string; password: string;
  preferred_language: string; created_at: string;
}
export interface DBPdf {
  id: number; user_id: number; file_name: string;
  file_uri: string; uploaded_at: string;
}
export interface DBStudiedTopic {
  topic_name: string; study_count: number; last_accessed: string;
}
export interface DBQuizScore {
  id: number; user_id: number; topic_name: string;
  score: number; total_questions: number; attempt_date: string;
}
export interface DBChatMessage {
  id: number; user_id: number; role: 'user' | 'ai';
  content: string; created_at: string;
}