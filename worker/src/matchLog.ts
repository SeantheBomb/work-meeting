import { RoundReveal } from "../../shared/types";
import { GameState } from "./engine";

export async function logMatchStart(db: D1Database, roomCode: string, state: GameState) {
  const players = [...state.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    agendaCard: p.agendaCard,
  }));
  try {
    await db
      .prepare(
        `INSERT INTO matches (id, room_code, started_at, player_count, bot_count, players_json) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(state.matchId, roomCode, new Date().toISOString(), players.length, players.filter((p) => p.isBot).length, JSON.stringify(players))
      .run();
  } catch (err) {
    console.error("logMatchStart failed", err);
  }
}

export async function logRoundEvents(db: D1Database, matchId: string, reveal: RoundReveal) {
  const now = new Date().toISOString();
  let seq = 0;
  const stmts = [];

  for (const play of reveal.plays) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO match_events (match_id, round, seq, event_type, player_id, player_name, card_id, card_name, topic, eff_attack, legal, is_winner, success, outcome_text, created_at)
           VALUES (?, ?, ?, 'play', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          matchId,
          reveal.round,
          seq++,
          play.playerId,
          play.playerName,
          play.cardId,
          play.cardName,
          null,
          play.effAttack,
          play.legal ? 1 : 0,
          play.isWinner ? 1 : 0,
          null,
          null,
          now
        )
    );
  }

  for (const name of reveal.passed) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO match_events (match_id, round, seq, event_type, player_name, created_at) VALUES (?, ?, ?, 'pass', ?, ?)`
        )
        .bind(matchId, reveal.round, seq++, name, now)
    );
  }

  stmts.push(
    db
      .prepare(`INSERT INTO match_events (match_id, round, seq, event_type, outcome_text, created_at) VALUES (?, ?, ?, 'resolve', ?, ?)`)
      .bind(matchId, reveal.round, seq++, reveal.outcomeText, now)
  );

  try {
    if (stmts.length) await db.batch(stmts as [D1PreparedStatement, ...D1PreparedStatement[]]);
  } catch (err) {
    console.error("logRoundEvents failed", err);
  }
}

export async function logMatchEnd(db: D1Database, state: GameState) {
  const summary = state.endSummary;
  if (!summary) return;
  const players = summary.players.map((p) => ({
    id: p.id,
    name: p.name,
    agendaCard: p.agendaCard,
    agendaAchievedCount: p.agendaAchievedCount,
    agendaSuccess: p.agendaSuccess,
  }));
  try {
    await db
      .prepare(
        `UPDATE matches SET ended_at = ?, rounds = ?, shared_agenda_success = ?, approved_count = ?, end_reason = ?, players_json = ? WHERE id = ?`
      )
      .bind(new Date().toISOString(), summary.rounds, summary.sharedAgendaSuccess ? 1 : 0, summary.approvedCount, summary.reason, JSON.stringify(players), state.matchId)
      .run();
  } catch (err) {
    console.error("logMatchEnd failed", err);
  }
}
