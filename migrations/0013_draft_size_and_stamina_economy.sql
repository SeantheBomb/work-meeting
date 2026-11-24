-- Post-launch feedback pass on the axis-transfer model (see DESIGN_NOTES.md section 28):
-- the full draft (17-51 picks depending on player count, clamped to floor(deckSize /
-- numPlayers)) was grueling in practice. draftDeckSize now caps at 16, which binds
-- uniformly at every supported player count (2-6) instead of scaling with the table.
--
-- The Stamina economy change (a bid is always spent, win or lose; a card's Stamina
-- Return only pays out if you're talked over) is a pure rules/engine change with no
-- new tunable -- nothing to migrate for it here.

UPDATE game_config SET value = 16 WHERE key = 'draftDeckSize';
