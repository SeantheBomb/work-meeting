-- Full redesign (see DESIGN_NOTES.md, "axis-transfer" pass): replaces the discrete
-- Topic status cycle with two continuous 0-1 axes per Topic (Agreement, read live as
-- "Approved" once it crosses approveThreshold; Pressure, which dampens how much an
-- Agreement change actually applies). Every card is a transfer between two Topics'
-- axes -- legality is purely "is the cost payable," no separate requirement system.
-- All card ids changed again (transfer-template ids like "Budget-ReallocateGoodwill-
-- Timeline-0"), so any old card_definitions override rows are dead weight -- clear them.
--
-- New config keys: approveThreshold (0.7, sim-tuned -- see DESIGN_NOTES.md) and
-- transferAmount (0.3, the flat amount a transfer moves before Pressure friction).
-- handSize and draftDeckSize revert to smaller code defaults (10 and a deliberately
-- large 50, always clamped to floor(deckSize/numPlayers) in practice) -- the old
-- Requirement-web card system needed a bigger hand to avoid starvation; the axis-
-- transfer model's legality (pure cost-payability) doesn't have that problem.
-- pressureThreshold was already vestigial after the back-to-roots status-cycle pass
-- and stays unused here too -- drop it instead of leaving a second dead knob behind.

DELETE FROM card_definitions;
DELETE FROM game_config WHERE key = 'pressureThreshold';

UPDATE game_config SET value = 10 WHERE key = 'handSize';
UPDATE game_config SET value = 50 WHERE key = 'draftDeckSize';

INSERT INTO game_config (key, value) VALUES ('approveThreshold', 0.7);
INSERT INTO game_config (key, value) VALUES ('transferAmount', 0.3);
