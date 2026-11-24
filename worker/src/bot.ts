import { AgendaCard, AgendaCell, CardDef, RoundReveal, Topic } from "../../shared/types";
import { GameState, isLegal, PendingVoteCandidate, PlayerState } from "./engine";

function cellAchieved(cell: AgendaCell, agreement: number, threshold: number): boolean {
  const approved = agreement >= threshold;
  return cell.stance === "Approve" ? approved : !approved;
}

/** Would this transfer, if it won right now, push its benefit Topic's Agreement across
 * the approve threshold -- or drag its cost Topic's Agreement back below it? Crossing
 * plays are the dramatic beats of a round; humans recognize them and fight over them. */
function crossingImpact(card: CardDef, state: GameState): { benefitCrossesUp: boolean; costCrossesDown: boolean } {
  if (card.effect.kind !== "transfer") return { benefitCrossesUp: false, costCrossesDown: false };
  const { costTopic, costAxis, benefitTopic, benefitAxis, amount } = card.effect;
  const threshold = state.config.approveThreshold;
  let benefitCrossesUp = false;
  let costCrossesDown = false;
  if (benefitAxis === "Agreement") {
    const t = state.topics[benefitTopic];
    const gain = amount * (1 - t.pressure);
    benefitCrossesUp = t.agreement < threshold && t.agreement + gain >= threshold;
  }
  if (costAxis === "Agreement") {
    const t = state.topics[costTopic];
    const loss = amount * (1 - t.pressure);
    costCrossesDown = t.agreement >= threshold && t.agreement - loss < threshold;
  }
  return { benefitCrossesUp, costCrossesDown };
}

/** 0..1: how much "the meeting is ending, act NOW" a human would feel. */
function lateGameUrgency(state: GameState): number {
  return Math.max(0, Math.min(1, 1 - state.duration / state.config.startingDuration)) ** 2;
}

/**
 * Experience-first heuristic bot. The goal is NOT optimal play -- it's play that reads
 * as intentional to the human across the table: fight hard for topics that obviously
 * matter to you, shrug at filler, panic a little when the clock runs down, and swing
 * big on threshold-crossing plays. Since every card is a transfer touching two Topics,
 * the score weighs both sides against the bot's own stance on each, then layers on the
 * board-state drama a human would actually be reacting to.
 */
function scoreCard(card: CardDef, state: GameState, player: PlayerState): number {
  let score = 0;
  const cellFor = (t: Topic) => player.agendaCard.find((c) => c.topic === t)!;
  const threshold = state.config.approveThreshold;

  if (card.effect.kind === "transfer") {
    const { costTopic, costAxis, benefitTopic, benefitAxis } = card.effect;
    const costCell = cellFor(costTopic);
    const benefitCell = cellFor(benefitTopic);

    // Draining Agreement from a Topic is bad if I want it Approved, good if I want it
    // kept Rejected -- draining Pressure is the same idea but lower-stakes (it just
    // loosens the Topic up, doesn't move it).
    score += costAxis === "Agreement" ? (costCell.stance === "Approve" ? -6 : 6) : costCell.stance === "Approve" ? -2 : 2;
    // Raising Agreement is good if I want that Topic Approved, bad otherwise. Raising
    // Pressure locks in whatever the Topic's current state already is.
    if (benefitAxis === "Agreement") {
      score += benefitCell.stance === "Approve" ? 8 : -8;
    } else {
      const currentlyApproved = state.topics[benefitTopic].agreement >= threshold;
      const locksInMyWant = benefitCell.stance === "Approve" ? currentlyApproved : !currentlyApproved;
      score += locksInMyWant ? 5 : -5;
    }

    // The dramatic beats: a play that flips a Topic's Approved reading in my favor is
    // worth fighting for; one that flips it against me is worth avoiding entirely.
    const { benefitCrossesUp, costCrossesDown } = crossingImpact(card, state);
    if (benefitCrossesUp) score += benefitCell.stance === "Approve" ? 10 : -12;
    if (costCrossesDown) score += costCell.stance === "Reject" ? 10 : -12;

    // Late-game: humans stop making tempo plays and go straight for their agenda.
    score += score > 0 ? score * lateGameUrgency(state) * 0.6 : 0;
  } else if (card.effect.kind === "extendDuration") {
    // "Wait, I'm not done" -- valuable exactly when a human would want it: the clock is
    // low AND my agenda still needs work.
    const unmetCells = player.agendaCard.filter((c) => !cellAchieved(c, state.topics[c.topic].agreement, threshold)).length;
    score += state.duration < 15 && unmetCells >= 2 ? 8 : state.duration < 15 ? 4 : -3;
  } else if (card.effect.kind === "durationMultiplier") {
    score += card.effect.multiplier < 1 ? 1 : -2;
  } else {
    // undo
    const snap = state.lastPlaySnapshot;
    if (!snap) {
      score -= 8; // nothing to undo
    } else if (snap.kind === "transfer") {
      const threshold = state.config.approveThreshold;
      const costCell = cellFor(snap.costTopic);
      const benefitCell = cellFor(snap.benefitTopic);
      const nowScore =
        (cellAchieved(costCell, state.topics[snap.costTopic].agreement, threshold) ? 1 : 0) +
        (cellAchieved(benefitCell, state.topics[snap.benefitTopic].agreement, threshold) ? 1 : 0);
      const beforeScore =
        (cellAchieved(costCell, snap.costBefore.agreement, threshold) ? 1 : 0) +
        (cellAchieved(benefitCell, snap.benefitBefore.agreement, threshold) ? 1 : 0);
      score += (beforeScore - nowScore) * 10; // reverting helps me only if "before" served my agenda better
    } else {
      score -= 3; // a Duration-clock undo is pure situational utility, no agenda read
    }
  }

  score += (Math.random() - 0.5) * 2;
  return score;
}

/** Bids that read as INTENT to the human across the table. High conviction or a
 * threshold-crossing play -> commit hard, like someone who clearly cares. Filler ->
 * shrug, bid small, keep powder dry. Late game raises everyone's temperature. Then two
 * kinds of noise a real table produces: an occasional bluff (big bid on a nothing card,
 * so a huge bid doesn't ALWAYS mean a huge play) and occasional sandbagging (letting a
 * good card ride cheap). The result should feel like a person, not a formula --
 * readable most of the time, wrong to fully trust. */
function chooseAttackSpend(conviction: number, currentStamina: number, state: GameState, isCrossingPlay: boolean): number {
  // conviction's realistic range is roughly -10..+25 after crossing/urgency bonuses.
  let share = 0.15 + Math.max(0, conviction) * 0.028;
  share += lateGameUrgency(state) * 0.25;
  if (isCrossingPlay) share += 0.3;

  const roll = Math.random();
  if (roll < 0.08) {
    share = 0.8 + Math.random() * 0.2; // bluff: full-throated bid on whatever this is
  } else if (roll < 0.16) {
    share *= 0.35; // sandbag: quietly lowball a card you actually like
  } else {
    share += (Math.random() - 0.5) * 0.2; // ordinary human wobble
  }

  share = Math.max(0.08, Math.min(0.95, share));
  return Math.max(1, Math.min(currentStamina, Math.round(share * currentStamina)));
}

export function chooseBotCommit(state: GameState, playerId: string): { cardId: string | null; attackSpend?: number } {
  const player = state.players.get(playerId);
  if (!player) return { cardId: null };

  // Out of Stamina -> can't bid at all; a plain Pass is the only way to recover.
  if (player.stamina < 1) return { cardId: null };

  const legal = player.hand.map((id) => state.deckById.get(id)!).filter((c) => isLegal(c, state));
  if (legal.length === 0) {
    // Nothing playable: bank the flat Pass reward. (Bots don't use the free
    // discard-swap -- keeping their turn a single decision keeps the room flowing.)
    return { cardId: null };
  }

  let best = legal[0];
  let bestScore = -Infinity;
  for (const card of legal) {
    const s = scoreCard(card, state, player);
    if (s > bestScore) {
      bestScore = s;
      best = card;
    }
  }

  // Rest-to-bank: a human low on Stamina with nothing exciting in hand sits a round
  // out and recovers, saving the pool for a play that matters.
  if (player.stamina <= 3 && bestScore < 8 && lateGameUrgency(state) < 0.7 && Math.random() < 0.7) {
    return { cardId: null };
  }

  const { benefitCrossesUp, costCrossesDown } = crossingImpact(best, state);
  const attackSpend = chooseAttackSpend(bestScore, player.stamina, state, benefitCrossesUp || costCrossesDown);
  return { cardId: best.id, attackSpend };
}

/**
 * Draft-time card evaluation. There's no board state yet (every Topic starts at
 * (0.5, 0.5)), so this scores raw power (Stamina Return + a cheap Sustain cost) plus fit
 * with the bot's own Hidden Agenda, and mildly penalizes stacking too many cards on the
 * same pair of Topics so the bot doesn't draft itself into a corner.
 */
function scoreDraftPick(card: CardDef, alreadyDrafted: CardDef[], agendaCard: AgendaCard): number {
  let score = card.staminaReturn * 1.5 + (6 - card.sustain) * 0.4;
  const cellFor = (t: Topic) => agendaCard.find((c) => c.topic === t)!;

  if (card.effect.kind === "transfer") {
    const { costTopic, costAxis, benefitTopic, benefitAxis } = card.effect;
    const costCell = cellFor(costTopic);
    const benefitCell = cellFor(benefitTopic);
    score += costAxis === "Agreement" ? (costCell.stance === "Approve" ? -3 : 3) : costCell.stance === "Approve" ? -1 : 1;
    score += benefitAxis === "Agreement" ? (benefitCell.stance === "Approve" ? 5 : -5) : benefitCell.stance === "Approve" ? 2 : -2;

    const touchesCount = alreadyDrafted.filter(
      (c) =>
        c.effect.kind === "transfer" &&
        (c.effect.costTopic === costTopic || c.effect.costTopic === benefitTopic || c.effect.benefitTopic === costTopic || c.effect.benefitTopic === benefitTopic)
    ).length;
    score -= touchesCount * 0.5;
  } else {
    score += 2; // universal utility cards (extend/multiplier/undo) are always useful regardless of board state
  }

  score += (Math.random() - 0.5) * 2;
  return score;
}

export function chooseBotDraftPick(state: GameState, playerId: string): string {
  const player = state.players.get(playerId)!;
  const pool = state.draftPool.map((id) => state.deckById.get(id)!);
  const alreadyDrafted = player.personalDeck.map((id) => state.deckById.get(id)!);

  let best = pool[0];
  let bestScore = -Infinity;
  for (const card of pool) {
    const s = scoreDraftPick(card, alreadyDrafted, player.agendaCard);
    if (s > bestScore) {
      bestScore = s;
      best = card;
    }
  }
  return best.id;
}

/**
 * Vote-time evaluation for a tied round: scores each candidate's card purely from the
 * voting bot's own Hidden Agenda perspective (does this card, if it wins, help or hurt
 * my own agenda cells), since the voter never benefits from Attack/Stamina Return on
 * someone else's play.
 */
function scoreCandidateForVoter(state: GameState, voterId: string, candidate: PendingVoteCandidate): number {
  const voter = state.players.get(voterId)!;
  const card = state.deckById.get(candidate.cardId)!;
  let score = 0;
  const cellFor = (t: Topic) => voter.agendaCard.find((c) => c.topic === t)!;

  if (card.effect.kind === "transfer") {
    const { costTopic, costAxis, benefitTopic, benefitAxis } = card.effect;
    if (costAxis === "Agreement") score += cellFor(costTopic).stance === "Approve" ? -8 : 8;
    if (benefitAxis === "Agreement") score += cellFor(benefitTopic).stance === "Approve" ? 8 : -8;
  } else if (card.effect.kind === "undo") {
    const snap = state.lastPlaySnapshot;
    if (snap && snap.kind === "transfer") {
      const threshold = state.config.approveThreshold;
      const costCell = cellFor(snap.costTopic);
      const benefitCell = cellFor(snap.benefitTopic);
      const nowScore =
        (cellAchieved(costCell, state.topics[snap.costTopic].agreement, threshold) ? 1 : 0) +
        (cellAchieved(benefitCell, state.topics[snap.benefitTopic].agreement, threshold) ? 1 : 0);
      const beforeScore =
        (cellAchieved(costCell, snap.costBefore.agreement, threshold) ? 1 : 0) +
        (cellAchieved(benefitCell, snap.benefitBefore.agreement, threshold) ? 1 : 0);
      score += (beforeScore - nowScore) * 8;
    }
  }

  score += (Math.random() - 0.5) * 2;
  return score;
}

export function chooseBotVote(state: GameState, voterId: string, candidates: PendingVoteCandidate[]): string {
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const s = scoreCandidateForVoter(state, voterId, candidate);
    if (s > bestScore) {
      bestScore = s;
      best = candidate;
    }
  }
  return best.playerId;
}

/* ===== Bot table talk ===== */

export interface BotChat {
  botId: string;
  templateId: string;
  values: string[];
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Post-reveal reactions -- the bots talking like players who just watched the same
 * round you did. Each reaction is grounded in what the bot actually experienced (won,
 * got talked over, saw a Topic it cares about flip) and, where it references a Topic,
 * usually reflects the bot's REAL stance -- with a deliberate minority of misdirection,
 * because table talk in this game is supposed to be only mostly trustworthy. Capped at
 * 2 messages per round so the room never feels like a spam channel.
 */
export function chooseBotReactions(state: GameState, reveal: RoundReveal): BotChat[] {
  const reactions: BotChat[] = [];
  const bots = [...state.players.values()].filter((p) => p.isBot);
  if (bots.length === 0) return reactions;
  const threshold = state.config.approveThreshold;
  const honest = () => Math.random() < 0.75;

  // Winner gloats.
  const winnerBot = reveal.winnerId ? bots.find((b) => b.id === reveal.winnerId) : undefined;
  if (winnerBot && Math.random() < 0.4) {
    const losers = reveal.plays.filter((p) => !p.isWinner).map((p) => p.playerName);
    const card = reveal.winningCard;
    if (card && card.effect.kind === "transfer" && Math.random() < 0.5) {
      // "Trust me on X" -- usually the topic the bot genuinely wants Approved; sometimes
      // (misdirection) a topic it secretly wants buried.
      const cell = winnerBot.agendaCard.find((c) => c.topic === (card.effect as { benefitTopic: Topic }).benefitTopic)!;
      const topic = honest() || cell.stance === "Approve" ? cell.topic : pick(winnerBot.agendaCard.filter((c) => c.stance === "Reject")).topic;
      reactions.push({ botId: winnerBot.id, templateId: "trust", values: [topic] });
    } else if (losers.length > 0) {
      reactions.push({ botId: winnerBot.id, templateId: "per-my-last", values: [pick(losers)] });
    }
  }

  // One talked-over bot complains about the winner.
  const talkedOverBots = reveal.plays.filter((p) => !p.isWinner).map((p) => bots.find((b) => b.id === p.playerId)).filter((b): b is PlayerState => !!b);
  if (talkedOverBots.length > 0 && reveal.winnerName && Math.random() < 0.35 && reactions.length < 2) {
    const bot = pick(talkedOverBots);
    const templateId = pick(["saw-that", "absolutely-not", "feeling"]);
    const values =
      templateId === "feeling" ? [pick(["hated", "did not understand", "am escalating to HR about"])] : [reveal.winnerName];
    reactions.push({ botId: bot.id, templateId, values });
  }

  // A Topic crossing the Approved threshold gets a stance-true reaction from whoever
  // has skin in it.
  const crossed = (reveal.topicChanges ?? []).find(
    (c) => c.axis === "Agreement" && ((c.before < threshold && c.after >= threshold) || (c.before >= threshold && c.after < threshold))
  );
  if (crossed && Math.random() < 0.5 && reactions.length < 2) {
    const wentUp = crossed.after >= threshold;
    const stakeholders = bots.filter((b) => b.id !== reveal.winnerId);
    const bot = pick(stakeholders.length ? stakeholders : bots);
    const cell = bot.agendaCard.find((c) => c.topic === crossed.topic)!;
    const happy = (cell.stance === "Approve") === wentUp;
    const phrase = happy ? pick(["non-negotiable", "fine, actually"]) : pick(["a dumpster fire", "everyone's problem now"]);
    reactions.push(
      happy || !honest()
        ? { botId: bot.id, templateId: "judgment", values: [crossed.topic, phrase] }
        : { botId: bot.id, templateId: "own-up", values: [crossed.topic] }
    );
  }

  // A winnerless round gets a weary quip.
  if (!reveal.winnerId && Math.random() < 0.3 && reactions.length === 0) {
    const bot = pick(bots);
    const templateId = pick(["email", "snacks"]);
    const values =
      templateId === "email"
        ? [pick(["an email", "a Slack thread", "a calendar decline"])]
        : [pick(["coffee", "donuts", "vibes", "per diem"])];
    reactions.push({ botId: bot.id, templateId, values });
  }

  return reactions.slice(0, 2);
}
