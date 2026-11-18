CREATE TABLE profiles (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('jogador', 'mestre')),
  created_at TEXT NOT NULL
);
