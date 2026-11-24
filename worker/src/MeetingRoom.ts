import { DurableObject } from "cloudflare:workers";
import { applyOverrides, applyTransferAmount, DEFAULT_CONFIG, DEFAULT_DECK } from "../../shared/cards";
import { ClientMessage, ServerMessage } from "../../shared/protocol";
import { MAX_PLAYERS, RoundReveal } from "../../shared/types";
import { validateAndRenderChat } from "../../shared/chat";
import { chooseBotCommit, chooseBotDraftPick, chooseBotReactions, chooseBotVote } from "./bot";
import { buildClientState } from "./clientState";
import {
  allCommitted,
  beginDraft,
  castVote,
  commitCard,
  discardSwap,
  draftPick,
  draftTurnPlayerId,
  finalizeDraft,
  GameState,
  isDraftComplete,
  resolveRound,
} from "./engine";
import { logMatchEnd, logMatchStart, logRoundEvents } from "./matchLog";
import { fromPersisted, PersistedGameState, toPersisted } from "./serialize";
import type { Env } from "./index";

interface LobbyPlayer {
  id: string;
  name: string;
  connected: boolean;
  isBot: boolean;
}

interface Attachment {
  playerId: string;
}

const BOT_NAMES = [
  "Kevin from IT (Bot)",
  "Synergy Steve (Bot)",
  "Kanban Ken (Bot)",
  "Kai the Intern (Bot)",
  "Autoreply Bot",
  "Minutes-Taking Bot",
  "Deirdre from Legal (Bot)",
  "Standup Stan (Bot)",
];

export class MeetingRoom extends DurableObject<Env> {
  private game: GameState | null = null;
  private lobby: LobbyPlayer[] | null = null;
  private hostId: string | null = null;
  private roomCode = "";
  private loaded = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private async ensureLoaded() {
    if (this.loaded) return;
    const [persistedGame, lobby, hostId, roomCode] = await Promise.all([
      this.ctx.storage.get<PersistedGameState>("game"),
      this.ctx.storage.get<LobbyPlayer[]>("lobby"),
      this.ctx.storage.get<string>("hostId"),
      this.ctx.storage.get<string>("roomCode"),
    ]);
    this.game = persistedGame ? fromPersisted(persistedGame) : null;
    this.lobby = lobby ?? [];
    this.hostId = hostId ?? null;
    this.roomCode = roomCode ?? "";
    this.loaded = true;
  }

  private async saveGame() {
    if (this.game) await this.ctx.storage.put("game", toPersisted(this.game));
  }

  private async saveLobby() {
    await this.ctx.storage.put("lobby", this.lobby ?? []);
    if (this.hostId) await this.ctx.storage.put("hostId", this.hostId);
  }

  /** Upserts this room's live presence into D1 for the landing page's "X meetings /
   * Y attendees right now" tracker. Counts connected humans only -- a room full of
   * idle bots isn't activity worth advertising. Rows go stale harmlessly; the /api/stats
   * query only counts rows updated in the last few minutes. */
  private async touchPresence() {
    if (!this.roomCode) return;
    const humans = this.game
      ? [...this.game.players.values()].filter((p) => !p.isBot && p.connected).length
      : (this.lobby ?? []).filter((p) => !p.isBot && p.connected).length;
    try {
      if (humans === 0) {
        await this.env.DB.prepare("DELETE FROM active_rooms WHERE room_code = ?").bind(this.roomCode).run();
      } else {
        await this.env.DB.prepare(
          "INSERT INTO active_rooms (room_code, player_count, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(room_code) DO UPDATE SET player_count = excluded.player_count, updated_at = excluded.updated_at"
        )
          .bind(this.roomCode, humans)
          .run();
      }
    } catch {
      // presence is best-effort; never let it break gameplay
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }
    await this.ensureLoaded();
    const roomCodeParam = new URL(request.url).searchParams.get("room");
    if (roomCodeParam && this.roomCode !== roomCodeParam) {
      this.roomCode = roomCodeParam;
      await this.ctx.storage.put("roomCode", this.roomCode);
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private send(ws: WebSocket, message: ServerMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // socket already closed; ignore
    }
  }

  private broadcastLobby() {
    if (!this.lobby) return;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, {
        type: "lobby",
        roomCode: this.roomCode,
        players: this.lobby.map((p) => ({ id: p.id, name: p.name, connected: p.connected, isBot: p.isBot })),
        youId: att.playerId,
        hostId: this.hostId ?? "",
      });
    }
  }

  private broadcastGameState() {
    if (!this.game) return;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      if (!this.game.players.has(att.playerId)) continue;
      this.send(ws, { type: "state", state: buildClientState(this.game, att.playerId) });
    }
  }

  private broadcastReveal(reveal: RoundReveal) {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, { type: "reveal", reveal });
    }
    this.emitBotReactions(reveal);
  }

  /** The bots' table talk about the round that just resolved -- same template system
   * humans use, so a bot line is indistinguishable in form from a human one. */
  private emitBotReactions(reveal: RoundReveal) {
    if (!this.game) return;
    const playerNames = [...this.game.players.values()].map((p) => p.name);
    for (const reaction of chooseBotReactions(this.game, reveal)) {
      const sender = this.game.players.get(reaction.botId);
      if (!sender) continue;
      const text = validateAndRenderChat(reaction.templateId, reaction.values, playerNames);
      if (!text) continue;
      this.broadcastChat({
        senderId: sender.id,
        senderName: sender.name,
        avatar: sender.avatar ?? "🤖",
        text,
        round: reveal.round,
      });
    }
  }

  private broadcastChat(chat: import("../../shared/chat").ChatBroadcast) {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, { type: "chat", chat });
    }
  }

  private async loadDeck(transferAmount: number) {
    try {
      const { results } = await this.env.DB.prepare(
        "SELECT id, sustain, stamina_return FROM card_definitions"
      ).all<{ id: string; sustain: number; stamina_return: number }>();
      const overrides = new Map(results.map((r) => [r.id, { sustain: r.sustain, staminaReturn: r.stamina_return }]));
      return applyTransferAmount(applyOverrides(DEFAULT_DECK, overrides), transferAmount);
    } catch {
      return applyTransferAmount(DEFAULT_DECK, transferAmount);
    }
  }

  private async loadConfig() {
    try {
      const { results } = await this.env.DB.prepare("SELECT key, value FROM game_config").all<{
        key: string;
        value: number;
      }>();
      const map = new Map(results.map((r) => [r.key, r.value]));
      return {
        startingDuration: map.get("startingDuration") ?? DEFAULT_CONFIG.startingDuration,
        handSize: map.get("handSize") ?? DEFAULT_CONFIG.handSize,
        roundSafetyCap: map.get("roundSafetyCap") ?? DEFAULT_CONFIG.roundSafetyCap,
        draftDeckSize: map.get("draftDeckSize") ?? DEFAULT_CONFIG.draftDeckSize,
        startingStamina: map.get("startingStamina") ?? DEFAULT_CONFIG.startingStamina,
        passReward: map.get("passReward") ?? DEFAULT_CONFIG.passReward,
        approveThreshold: map.get("approveThreshold") ?? DEFAULT_CONFIG.approveThreshold,
        transferAmount: map.get("transferAmount") ?? DEFAULT_CONFIG.transferAmount,
      };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    await this.ensureLoaded();
    if (typeof raw !== "string") return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === "join") {
      await this.handleJoin(ws, msg.playerId, msg.name);
      return;
    }

    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) {
      this.send(ws, { type: "error", message: "Join the room before doing that." });
      return;
    }

    if (msg.type === "start") {
      await this.handleStart(att.playerId);
    } else if (msg.type === "draft-pick") {
      await this.handleDraftPick(att.playerId, msg.cardId);
    } else if (msg.type === "draft-auto-pick") {
      await this.handleDraftAutoPick(att.playerId);
    } else if (msg.type === "commit") {
      await this.handleCommit(att.playerId, msg.cardId, msg.attackSpend);
    } else if (msg.type === "discard-swap") {
      await this.handleDiscardSwap(att.playerId, msg.cardId);
    } else if (msg.type === "chat") {
      this.handleChat(att.playerId, msg.templateId, msg.values);
    } else if (msg.type === "vote") {
      await this.handleVote(att.playerId, msg.candidatePlayerId);
    } else if (msg.type === "restart") {
      await this.handleRestart();
    } else if (msg.type === "add-bot") {
      await this.handleAddBot();
    } else if (msg.type === "remove-bot") {
      await this.handleRemoveBot(msg.playerId);
    }
  }

  private async handleJoin(ws: WebSocket, playerId: string, name: string) {
    if (this.game && this.game.players.has(playerId)) {
      const player = this.game.players.get(playerId)!;
      player.connected = true;
      ws.serializeAttachment({ playerId } satisfies Attachment);
      await this.saveGame();
      await this.touchPresence();
      this.send(ws, { type: "state", state: buildClientState(this.game, playerId) });
      return;
    }

    if (this.game) {
      this.send(ws, { type: "error", message: "This meeting already started without you." });
      return;
    }

    this.lobby = this.lobby ?? [];
    const existing = this.lobby.find((p) => p.id === playerId);
    if (existing) {
      existing.connected = true;
      existing.name = name || existing.name;
    } else {
      if (this.lobby.length >= MAX_PLAYERS) {
        this.send(ws, { type: "error", message: `This meeting is full (${MAX_PLAYERS} people is already too many).` });
        return;
      }
      this.lobby.push({ id: playerId, name: name || "New Hire", connected: true, isBot: false });
      if (!this.hostId) this.hostId = playerId;
    }
    ws.serializeAttachment({ playerId } satisfies Attachment);
    await this.saveLobby();
    await this.touchPresence();
    this.broadcastLobby();
  }

  private async handleAddBot() {
    if (this.game) return;
    this.lobby = this.lobby ?? [];
    if (this.lobby.length >= MAX_PLAYERS) return;
    const usedNames = new Set(this.lobby.map((p) => p.name));
    const available = BOT_NAMES.filter((n) => !usedNames.has(n));
    const name = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : `Bot #${this.lobby.length + 1}`;
    this.lobby.push({ id: `bot-${crypto.randomUUID()}`, name, connected: true, isBot: true });
    await this.saveLobby();
    this.broadcastLobby();
  }

  private async handleRemoveBot(playerId: string) {
    if (this.game) return;
    if (!this.lobby) return;
    const target = this.lobby.find((p) => p.id === playerId);
    if (!target || !target.isBot) return;
    this.lobby = this.lobby.filter((p) => p.id !== playerId);
    await this.saveLobby();
    this.broadcastLobby();
  }

  private async handleStart(playerId: string) {
    if (this.game) return;
    if (!this.lobby || this.lobby.length < 2) {
      const ws = this.findSocket(playerId);
      if (ws) this.send(ws, { type: "error", message: "Need at least 2 people in the meeting to start." });
      return;
    }
    const config = await this.loadConfig();
    const deck = await this.loadDeck(config.transferAmount);
    this.game = beginDraft(
      this.lobby.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot })),
      deck,
      config
    );
    for (const p of this.lobby) {
      const player = this.game.players.get(p.id);
      if (player) player.connected = p.connected;
    }
    await this.saveGame();
    await this.ctx.storage.delete("lobby");
    // Hidden Agendas are assigned as soon as the draft opens, so log the match now.
    await logMatchStart(this.env.DB, this.roomCode, this.game);
    await this.advanceDraftWithBots();
  }

  /** Auto-picks for any bot whose turn it is in the draft, and repeats until it's a
   * human's turn or the draft completes -- then hands off into the commit phase. */
  private async advanceDraftWithBots() {
    if (!this.game) return;
    let guard = 0;
    while (this.game.phase === "draft" && guard++ < 500) {
      const turnPlayerId = draftTurnPlayerId(this.game);
      if (turnPlayerId === null) break;
      const player = this.game.players.get(turnPlayerId)!;
      if (!player.isBot) break;
      const cardId = chooseBotDraftPick(this.game, turnPlayerId);
      draftPick(this.game, turnPlayerId, cardId);
    }
    if (this.game.phase === "draft" && isDraftComplete(this.game)) {
      finalizeDraft(this.game);
      await this.saveGame();
      this.broadcastGameState();
      await this.advanceWithBots();
      return;
    }
    await this.saveGame();
    this.broadcastGameState();
  }

  private async handleDraftPick(playerId: string, cardId: string) {
    if (!this.game) return;
    const result = draftPick(this.game, playerId, cardId);
    if (!result.ok) {
      const ws = this.findSocket(playerId);
      if (ws) this.send(ws, { type: "error", message: result.error });
      return;
    }
    await this.advanceDraftWithBots();
  }

  /** "Choose for me": picks with the same agenda-fit scoring the bots use (which
   * already falls back to effectively-random via its jitter when nothing stands out). */
  private async handleDraftAutoPick(playerId: string) {
    if (!this.game || this.game.phase !== "draft") return;
    if (draftTurnPlayerId(this.game) !== playerId) {
      const ws = this.findSocket(playerId);
      if (ws) this.send(ws, { type: "error", message: "Not your turn to draft." });
      return;
    }
    const cardId = chooseBotDraftPick(this.game, playerId);
    await this.handleDraftPick(playerId, cardId);
  }

  private async handleCommit(playerId: string, cardId: string | null, attackSpend?: number) {
    if (!this.game) return;
    const result = commitCard(this.game, playerId, cardId, attackSpend);
    if (!result.ok) {
      const ws = this.findSocket(playerId);
      if (ws) this.send(ws, { type: "error", message: result.error });
      return;
    }
    await this.advanceWithBots();
  }

  /** Human chat: validate the template + slot values server-side (the anti-free-text
   * gate lives in shared/chat.ts) and broadcast the rendered line to the whole room. */
  private handleChat(playerId: string, templateId: string, values: string[]) {
    let sender: { id: string; name: string; avatar?: string } | undefined;
    let playerNames: string[];
    let round = 0;
    if (this.game) {
      sender = this.game.players.get(playerId);
      playerNames = [...this.game.players.values()].map((p) => p.name);
      round = this.game.round;
    } else {
      sender = (this.lobby ?? []).find((p) => p.id === playerId);
      playerNames = (this.lobby ?? []).map((p) => p.name);
    }
    if (!sender) return;
    const text = validateAndRenderChat(templateId, values, playerNames);
    if (!text) {
      const ws = this.findSocket(playerId);
      if (ws) this.send(ws, { type: "error", message: "That message didn't parse. Try the builder again." });
      return;
    }
    this.broadcastChat({
      senderId: sender.id,
      senderName: sender.name,
      avatar: (sender as { avatar?: string }).avatar ?? "🧑‍💼",
      text,
      round,
    });
  }

  /** The free once-per-round discard-swap -- doesn't consume the player's turn, so it
   * only updates and rebroadcasts state; no round advancement is involved. */
  private async handleDiscardSwap(playerId: string, cardId: string) {
    if (!this.game) return;
    const result = discardSwap(this.game, playerId, cardId);
    if (!result.ok) {
      const ws = this.findSocket(playerId);
      if (ws) this.send(ws, { type: "error", message: result.error });
      return;
    }
    await this.saveGame();
    this.broadcastGameState();
  }

  /** Auto-commits any bot players still pending in the current round, resolves the
   * round once everyone (human + bot) is in, and repeats -- so a room with only one
   * connected human still advances every round without the human touching bot turns.
   * Chain-resolves multiple rounds in a row only if every remaining player is a bot.
   * A resolved round can come back as a tie needing a table vote instead of a finished
   * round -- in that case we hand off to advanceVoteWithBots and, if a human still
   * needs to vote, stop and wait for them. */
  private async advanceWithBots() {
    if (!this.game) return;
    let guard = 0;
    while (this.game.phase === "commit" && guard++ < 100) {
      for (const player of this.game.players.values()) {
        if (player.isBot && !this.game.commits.has(player.id)) {
          const choice = chooseBotCommit(this.game, player.id);
          commitCard(this.game, player.id, choice.cardId, choice.attackSpend);
        }
      }
      if (!allCommitted(this.game)) break;
      const reveal = resolveRound(this.game);
      await logRoundEvents(this.env.DB, this.game.matchId, reveal);
      await this.saveGame();
      this.broadcastReveal(reveal);
      this.broadcastGameState();
      if (this.game.pendingVote) {
        await this.advanceVoteWithBots();
        if (this.game.pendingVote) break; // still waiting on a human vote
        if (this.game.phase !== "commit") break; // the vote ended the game
        continue;
      }
      const phaseNow: string = this.game.phase;
      if (phaseNow === "ended") {
        await logMatchEnd(this.env.DB, this.game);
        break;
      }
    }
    await this.saveGame();
    this.broadcastGameState();
  }

  /** Auto-casts votes for any bot voters in the current pending tie-vote. Stops as soon
   * as the vote completes (broadcasting the real round outcome) or as soon as only human
   * voters remain. */
  private async advanceVoteWithBots() {
    if (!this.game || !this.game.pendingVote) return;
    const vote = this.game.pendingVote;
    for (const voterId of vote.voterIds) {
      if (!this.game.pendingVote) return; // already resolved
      if (vote.votes.some((v) => v.voterId === voterId)) continue;
      const voter = this.game.players.get(voterId)!;
      if (!voter.isBot) continue;
      const candidatePlayerId = chooseBotVote(this.game, voterId, vote.candidates);
      const result = castVote(this.game, voterId, candidatePlayerId);
      if (!result.ok) continue;
      if (result.reveal) {
        await logRoundEvents(this.env.DB, this.game.matchId, result.reveal);
        await this.saveGame();
        this.broadcastReveal(result.reveal);
        this.broadcastGameState();
        if (this.game.phase === "ended") {
          await logMatchEnd(this.env.DB, this.game);
        }
        return;
      }
    }
  }

  private async handleVote(playerId: string, candidatePlayerId: string) {
    if (!this.game) return;
    const result = castVote(this.game, playerId, candidatePlayerId);
    if (!result.ok) {
      const ws = this.findSocket(playerId);
      if (ws) this.send(ws, { type: "error", message: result.error });
      return;
    }
    await this.saveGame();
    if (!result.reveal) {
      this.broadcastGameState();
      return;
    }
    await logRoundEvents(this.env.DB, this.game.matchId, result.reveal);
    this.broadcastReveal(result.reveal);
    this.broadcastGameState();
    if (this.game.phase === "ended") {
      await logMatchEnd(this.env.DB, this.game);
      return;
    }
    await this.advanceWithBots();
  }

  private async handleRestart() {
    if (!this.game || this.game.phase !== "ended") return;
    this.lobby = this.game.seatOrder.map((id) => {
      const p = this.game!.players.get(id)!;
      return { id: p.id, name: p.name, connected: p.connected, isBot: p.isBot };
    });
    this.hostId = this.hostId ?? this.lobby[0]?.id ?? null;
    this.game = null;
    await this.ctx.storage.delete("game");
    await this.saveLobby();
    this.broadcastLobby();
  }

  private findSocket(playerId: string): WebSocket | undefined {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att && att.playerId === playerId) return ws;
    }
    return undefined;
  }

  async webSocketClose(ws: WebSocket) {
    await this.ensureLoaded();
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;
    if (this.game) {
      const player = this.game.players.get(att.playerId);
      if (player) {
        player.connected = false;
        await this.saveGame();
        await this.touchPresence();
        this.broadcastGameState();
      }
    } else if (this.lobby) {
      const player = this.lobby.find((p) => p.id === att.playerId);
      if (player) {
        player.connected = false;
        await this.saveLobby();
        await this.touchPresence();
        this.broadcastLobby();
      }
    }
  }

  async webSocketError() {
    // handled the same as close by the runtime invoking webSocketClose afterward
  }
}
