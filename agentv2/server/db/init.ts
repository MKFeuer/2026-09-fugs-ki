import { Database } from "bun:sqlite";
import { join } from "node:path";

const dbPath = join(import.meta.dir, "..", "..", "data", "agentv2.db");
const db = new Database(dbPath);

// Enable foreign keys
db.run("PRAGMA foreign_keys = ON");

// Sessions table
db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    active_chat_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// Chats table
db.run(`
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  )
`);

// Messages table
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  )
`);

// Activities table
db.run(`
  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    label TEXT NOT NULL,
    detail TEXT NOT NULL,
    tone TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  )
`);

// Canvas items table
db.run(`
  CREATE TABLE IF NOT EXISTS canvas_items (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  )
`);

// Turns table
db.run(`
  CREATE TABLE IF NOT EXISTS turns (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    user_message_id TEXT,
    assistant_message_id TEXT,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  )
`);

// Indexes for common queries
db.run(`CREATE INDEX IF NOT EXISTS idx_chats_session_id ON chats(session_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_activities_chat_id ON activities(chat_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_canvas_items_chat_id ON canvas_items(chat_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_turns_chat_id ON turns(chat_id)`);

export { db };
