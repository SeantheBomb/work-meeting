-- Eighth pass: replaces the fixed per-card Attack/Decay stats with a player-managed
-- Stamina economy. Attack is now a per-round player choice (0..current Stamina spent as
-- their bid for priority); each card instead prints a single Stamina Return, refunded in
-- full if a card gets talked over, or added back (net of the Attack spent) if it wins.
-- The Chair holder gets a free +1 Attack. See DESIGN_NOTES.md section 19.
--
-- card_definitions previously stored (attack, sustain, decay); recreated with
-- (sustain, stamina_return) instead. Table is already empty (cleared in migration 0009
-- when every card id changed), so a straight drop-and-recreate is safe -- no data loss.
--
-- New game_config key: startingStamina (10, matching shared/cards.ts DEFAULT_CONFIG --
-- a first-pass value meant to be tuned via the balance sim like every other constant
-- here, not a final number).

DROP TABLE card_definitions;

CREATE TABLE card_definitions (
  id TEXT PRIMARY KEY,
  sustain INTEGER NOT NULL,
  stamina_return INTEGER NOT NULL
);

INSERT INTO game_config (key, value) VALUES ('startingStamina', 10);
