-- Fifth pass: Rejected status (Approved's symmetric opposite), Hidden Agendas
-- redesigned as Approve-vs-Reject, tie-breaking by table vote instead of always
-- going to the Chair, a revised side-effect pool (cut Peek/Rebate, added
-- Distract/Crown's Burden/Undercut), and a 6th card template ("Reject" /
-- "Let's Revisit Next Quarter") to expand variety. See DESIGN_NOTES.md.
--
-- All of the above is structural (code-level), not D1-tunable. The one numeric
-- change that touches this table: ShootDown's Decay moved 1->2 in the default
-- deck (shared/cards.ts) so no two templates share the same Attack/Sustain/Decay
-- triple (it previously collided with TableIt's (2,3,1)). The stale D1 override
-- from 0001_init.sql was still pinning it at 1 and would have silently
-- reintroduced that collision without this fix.

UPDATE card_definitions SET decay = 2 WHERE id LIKE '%-ShootDown';
