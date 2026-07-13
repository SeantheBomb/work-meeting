-- Balance/troubleshooting log. Query this from the D1 dashboard or
-- `wrangler d1 execute work-meeting-db --remote --command "..."` to see how
-- real matches actually played out (round counts, Shared Agenda hit rate,
-- which cards win priority, entrenchment bounces, etc.) -- the same kind of
-- signal the GDD's own simulation harness produced, but from live playtests.

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  player_count INTEGER NOT NULL,
  bot_count INTEGER NOT NULL,
  rounds INTEGER,
  shared_agenda_success INTEGER,
  approved_count INTEGER,
  end_reason TEXT,
  players_json TEXT NOT NULL
);

CREATE TABLE match_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  player_id TEXT,
  player_name TEXT,
  card_id TEXT,
  card_name TEXT,
  topic TEXT,
  eff_attack INTEGER,
  legal INTEGER,
  is_winner INTEGER,
  success INTEGER,
  outcome_text TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_match_events_match_id ON match_events (match_id);
