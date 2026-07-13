-- Fourth pass: main+side effect cards, per-Status Resolve mechanics, Pressure on
-- talked-over plays, and a redesigned adversarial Hidden Agenda system. See
-- DESIGN_NOTES.md for the full spec and README.md for validated simulation results.
--
-- Card Attack/Sustain/Decay values are unchanged from the previous pass -- this
-- migration only adds the new pressureThreshold config knob. Side effects, per-status
-- Resolve modifiers, and the Hidden Agenda system are code-level (not D1-tunable),
-- since they're structural rules rather than numeric dials.

INSERT INTO game_config (key, value) VALUES ('pressureThreshold', 3);
