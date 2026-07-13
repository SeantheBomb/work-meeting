import { DurableObject } from "cloudflare:workers";
import { applyOverrides, DEFAULT_CONFIG, DEFAULT_DECK } from "../../shared/cards";
import { ClientMessage, ServerMessage } from "../../shared/protocol";
import { buildClientState } from "./clientState";
import { allCommitted, commitCard, createGame, GameState, resolveRound } from "./engine";
import { fromPersisted, PersistedGameState, toPersisted } from "./serialize";
import type { Env } from "./index";

interface LobbyPlayer {
  id: string;
  name: string;
  connected: boolean;
}

interface Attachment {
  playerId: string;
}

const MAX_PLAYERS = 8;

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
        players: this.lobby.map((p) => ({ id: p.id, name: p.name, connected: p.connected })),
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

  private broadcastReveal(reveal: import("../../shared/types").RoundReveal) {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.send(ws, { type: "reveal", reveal });
    }
  }

  private async loadDeck() {
    try {
      const { results } = await this.env.DB.prepare(
        "SELECT id, attack, sustain, decay FROM card_definitions"
      ).all<{ id: string; attack: number; sustain: number; decay: number }>();
      const overrides = new Map(results.map((r) => [r.id, { attack: r.attack, sustain: r.sustain, decay: r.decay }]));
      return applyOverrides(DEFAULT_DECK, overrides);
    } catch {
      return DEFAULT_DECK;
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
    } else if (msg.type === "commit") {
      await this.handleCommit(att.playerId, msg.cardId, msg.targetTopic);
    } else if (msg.type === "restart") {
      await this.handleRestart();
    }
  }

  private async handleJoin(ws: WebSocket, playerId: string, name: string) {
    if (this.game && this.game.players.has(playerId)) {
      const player = this.game.players.get(playerId)!;
      player.connected = true;
      ws.serializeAttachment({ playerId } satisfies Attachment);
      await this.saveGame();
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
        this.send(ws, { type: "error", message: "This meeting is full (8 people is already too many)." });
        return;
      }
      this.lobby.push({ id: playerId, name: name || "New Hire", connected: true });
      if (!this.hostId) this.hostId = playerId;
    }
    ws.serializeAttachment({ playerId } satisfies Attachment);
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
    const [deck, config] = await Promise.all([this.loadDeck(), this.loadConfig()]);
    this.game = createGame(
      this.lobby.map((p) => ({ id: p.id, name: p.name })),
      deck,
      config
    );
    for (const p of this.lobby) {
      const player = this.game.players.get(p.id);
      if (player) player.connected = p.connected;
    }
    await this.saveGame();
    await this.ctx.storage.delete("lobby");
    this.broadcastGameState();
  }

  private async handleCommit(playerId: string, cardId: string | null, targetTopic?: import("../../shared/types").Topic) {
    if (!this.game) return;
    const result = commitCard(this.game, playerId, cardId, targetTopic);
    if (!result.ok) {
      const ws = this.findSocket(playerId);
      if (ws) this.send(ws, { type: "error", message: result.error });
      return;
    }
    if (allCommitted(this.game)) {
      const reveal = resolveRound(this.game);
      await this.saveGame();
      this.broadcastReveal(reveal);
      this.broadcastGameState();
    } else {
      await this.saveGame();
      this.broadcastGameState();
    }
  }

  private async handleRestart() {
    if (!this.game || this.game.phase !== "ended") return;
    this.lobby = this.game.seatOrder.map((id) => {
      const p = this.game!.players.get(id)!;
      return { id: p.id, name: p.name, connected: p.connected };
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
        this.broadcastGameState();
      }
    } else if (this.lobby) {
      const player = this.lobby.find((p) => p.id === att.playerId);
      if (player) {
        player.connected = false;
        await this.saveLobby();
        this.broadcastLobby();
      }
    }
  }

  async webSocketError() {
    // handled the same as close by the runtime invoking webSocketClose afterward
  }
}
