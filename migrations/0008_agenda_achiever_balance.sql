-- Sixth pass: Sean's ask was "at least one player achieves their Agenda Card (2-of-4)
-- in >=75% of matches." Baseline was 32-63% depending on player count. Root cause:
-- games weren't resolving enough Topics to a terminal status before ending (2P stalls
-- via awkward silence -- nobody has a legal card; 8P blows past the round safety cap).
-- Hand size was the dominant lever -- a bigger hand means fewer dead "nothing legal"
-- turns, which lets more Topics actually resolve to Approved/Rejected.
--
-- Duration 30->50, Hand size 5->7: gets 2P/4P/5P to 75-88% achiever rate. 8P still
-- lags (~63-72% across every config tried) -- it's been the structurally weakest
-- player count all project, not something one more numeric tweak fully resolves.
--
-- Side effect: bigger hands make New Business (the always-legal wildcard) win a lot
-- more often (dominant-card share ~46% -> ~67-73% of matches). Tried nerfing it
-- directly (fewer copies, weaker Attack) but that backfires hard -- New Business was
-- doing real work keeping games from stalling, so weakening it tanks the achiever
-- rate right back down. Decay 1->2 (this migration) is a mild compromise: keeps NB's
-- per-play power and availability (so it still prevents stalls) but discourages
-- spamming it round after round. Does not fully fix the dominance regression --
-- Sean explicitly deferred that to its own follow-up redesign pass rather than
-- solving it today. See DESIGN_NOTES.md section 11.

UPDATE game_config SET value = 50 WHERE key = 'startingDuration';
UPDATE game_config SET value = 7 WHERE key = 'handSize';
UPDATE card_definitions SET decay = 2 WHERE id IN ('NewBusinessA', 'NewBusinessB', 'NewBusinessC', 'NewBusinessD');
