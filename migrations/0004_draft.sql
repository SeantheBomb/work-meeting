-- Deck-building draft phase: each player now drafts their own personal deck from
-- the shared card pool at the start of a meeting, instead of drawing from one
-- shared random deck. See README.md "Deck-building draft" section.

INSERT INTO game_config (key, value) VALUES ('draftDeckSize', 10);
