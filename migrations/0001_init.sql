-- Card stats are data, not code, so they can be tuned from the D1 dashboard
-- without redeploying the worker. Values here mirror the GDD's simulation-validated
-- defaults (Section 8) and the prototype's assumed starting config (see README).

CREATE TABLE card_definitions (
  id TEXT PRIMARY KEY,
  attack INTEGER NOT NULL,
  sustain INTEGER NOT NULL,
  decay INTEGER NOT NULL
);

CREATE TABLE game_config (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

INSERT INTO card_definitions (id, attack, sustain, decay) VALUES
  ('Budget-QuickNote', 1, 1, 0),
  ('Budget-PushBack', 2, 2, 1),
  ('Budget-TableIt', 2, 3, 1),
  ('Budget-SignOff', 2, 4, 2),
  ('Budget-ShootDown', 2, 3, 1),
  ('Timeline-QuickNote', 1, 1, 0),
  ('Timeline-PushBack', 2, 2, 1),
  ('Timeline-TableIt', 2, 3, 1),
  ('Timeline-SignOff', 2, 4, 2),
  ('Timeline-ShootDown', 2, 3, 1),
  ('Personnel-QuickNote', 1, 1, 0),
  ('Personnel-PushBack', 2, 2, 1),
  ('Personnel-TableIt', 2, 3, 1),
  ('Personnel-SignOff', 2, 4, 2),
  ('Personnel-ShootDown', 2, 3, 1),
  ('Strategy-QuickNote', 1, 1, 0),
  ('Strategy-PushBack', 2, 2, 1),
  ('Strategy-TableIt', 2, 3, 1),
  ('Strategy-SignOff', 2, 4, 2),
  ('Strategy-ShootDown', 2, 3, 1),
  ('Operations-QuickNote', 1, 1, 0),
  ('Operations-PushBack', 2, 2, 1),
  ('Operations-TableIt', 2, 3, 1),
  ('Operations-SignOff', 2, 4, 2),
  ('Operations-ShootDown', 2, 3, 1),
  ('NewBusinessA', 3, 1, 0),
  ('NewBusinessB', 3, 1, 0),
  ('Overtime', 5, 0, 0);

INSERT INTO game_config (key, value) VALUES
  ('startingDuration', 30),
  ('handSize', 3),
  ('roundSafetyCap', 40);
