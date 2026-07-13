-- Second balance pass, driven by a real playthrough where one bot won 6 straight
-- rounds with New Business (Attack 3, Decay 0 -- never got weaker no matter how
-- often it won, while every other card that won accrued Decay and got progressively
-- worse). See HAPPY_PATH.md for the "happy path" criteria this was measured against
-- and README.md for the before/after simulation numbers.
--
-- New Business: Attack 3->2, Decay 0->1 (no longer strictly better than a topic's
-- own Quick Note with a Decay-free repeat-use advantage).
-- Overtime: Decay 0->1 (kept Attack 3 -- it needs to reliably win when the table
-- actually needs Duration back, but the same "never gets weaker" repeat-spam
-- exploit applied to it too).

UPDATE card_definitions SET attack = 2, decay = 1 WHERE id IN ('NewBusinessA', 'NewBusinessB', 'NewBusinessC', 'NewBusinessD');
UPDATE card_definitions SET decay = 1 WHERE id = 'Overtime';
