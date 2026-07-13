-- First simulation-driven balance pass. See /sim-results and README.md
-- "Simulation & balance findings" for the full before/after numbers.
--
-- Root cause: Rewrite/Remove legality was gated on matching a single global
-- "Floor" (Uno-style), which left 44-58% of all turns with zero legal cards
-- and collapsed 2P/4P meetings via mass "awkward silence" passes within ~3-4
-- rounds (86-96% of games). That gating was removed in code (engine.ts) --
-- Rewrite/Remove are now legal any time their own topic has an existing item,
-- full stop. This migration ships the remaining numeric levers: bigger hands,
-- a non-broken Overtime, and two more New Business copies.

UPDATE game_config SET value = 5 WHERE key = 'handSize';

UPDATE card_definitions SET attack = 3 WHERE id = 'Overtime';

INSERT INTO card_definitions (id, attack, sustain, decay) VALUES
  ('NewBusinessC', 3, 1, 0),
  ('NewBusinessD', 3, 1, 0);
