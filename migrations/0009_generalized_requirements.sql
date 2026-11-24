-- Seventh pass: full card-system rewrite. Every card (Target Topic, Title, Attack/
-- Sustain/Decay, Requirement, Main Effect, Side Effect, flavor text) replaces the old
-- fixed verb/template system (Add/Rewrite/Remove). Only New Business is ever
-- unconditionally legal; every other card -- including raising a Topic -- is gated by
-- a single flexible requirement, frequently about a DIFFERENT Topic's state or the
-- Chair. See DESIGN_NOTES.md section 12 and CARD_GRAPH_ANALYSIS.md for the exact-graph
-- search that picked this arrangement ("Spread+Chair") over a naive single-neighbor
-- design. All card ids changed (Budget-QuickNote etc. no longer exist), so the old
-- per-card `card_definitions` override rows are pure clutter now -- clear them out
-- rather than leave orphaned rows an admin might mistake for live tuning.
--
-- Config: startingDuration 50->65, handSize 7->9, draftDeckSize 10->14. The new
-- interdependent-requirement design needs more legal-card headroom per turn than the
-- prior verb system did (confirmed via full balance resim -- see DESIGN_NOTES.md).

DELETE FROM card_definitions;

UPDATE game_config SET value = 65 WHERE key = 'startingDuration';
UPDATE game_config SET value = 9 WHERE key = 'handSize';
UPDATE game_config SET value = 14 WHERE key = 'draftDeckSize';
