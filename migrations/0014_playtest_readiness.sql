-- Playtest-readiness pass (see DESIGN_NOTES.md section 29):
--
-- passReward: a plain Pass now earns a flat amount of Stamina (no consecutive-pass
-- growth), and it's the only way to recover -- a bid is always spent, and a card can
-- never be played for 0 Stamina (min bid 1; at 0 you must Pass). Sim-swept before
-- settling on 5.
--
-- active_rooms: live-presence heartbeat rows, one per room with connected humans,
-- powering the landing page's "X meetings / Y attendees right now" tracker via
-- GET /api/stats (rows older than 10 minutes are ignored as dead).

INSERT INTO game_config (key, value) VALUES ('passReward', 5);

CREATE TABLE active_rooms (
  room_code TEXT PRIMARY KEY,
  player_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
