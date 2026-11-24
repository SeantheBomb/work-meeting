import { AgendaCell, AgendaCellResult, CardDef, CardEffect, RevealPlay, RoundReveal, Topic, TOPICS } from "../../shared/types";
import { ClientGameState, LobbyPlayerView, PendingVoteCandidate, ServerMessage } from "../../shared/protocol";
import { agendaCellLabel } from "../../shared/hiddenAgenda";
import { ChatBroadcast, CHAT_TEMPLATES, chatTemplateById } from "../../shared/chat";
import { connect } from "./ws";
import { flash, glowPulse, popIn, staggerIn, tweenNumber, tweenWidth } from "./anim";

interface Conn {
  socket: WebSocket;
  send: (msg: import("../../shared/protocol").ClientMessage) => void;
}

interface AppState {
  screen: "landing" | "connecting" | "lobby" | "game";
  roomCode: string;
  playerId: string;
  name: string;
  conn: Conn | null;
  lobby: { roomCode: string; players: LobbyPlayerView[]; youId: string; hostId: string } | null;
  game: ClientGameState | null;
  reveal: RoundReveal | null;
  revealVisible: boolean;
  selectedCardId: string | null;
  /** How much Stamina to bid on the selected card this round -- defaults to the
   * player's full current Stamina whenever a new card is selected, adjustable down to a
   * minimum of 1 (a card can never be played for free). */
  selectedAttackSpend: number;
  error: string | null;
  showHelp: boolean;
  showHandHint: boolean;
  /** Quick Start: after creating the room, auto-fill it with 4 bots and start
   * immediately -- a zero-friction solo session from the landing page. */
  quickStart: boolean;
  /** Live "who's playing right now" numbers from /api/stats, for the landing page. */
  stats: { rooms: number; players: number } | null;
  /** Madlibs table-talk drawer. Compose state lives here so the full-DOM re-render on
   * every server message doesn't wipe a half-built message. */
  chat: {
    open: boolean;
    unread: number;
    messages: ChatBroadcast[];
    composeTemplateId: string | null;
    composeValues: string[];
  };
}

const state: AppState = {
  screen: "landing",
  roomCode: "",
  playerId: "",
  name: localStorage.getItem("wm_name") ?? "",
  conn: null,
  lobby: null,
  game: null,
  reveal: null,
  revealVisible: false,
  selectedCardId: null,
  selectedAttackSpend: 0,
  error: null,
  showHelp: !localStorage.getItem("wm_seen_tutorial"),
  showHandHint: !localStorage.getItem("wm_seen_hand_hint"),
  quickStart: false,
  stats: null,
  chat: { open: false, unread: 0, messages: [], composeTemplateId: null, composeValues: [] },
};

async function fetchStats() {
  try {
    const res = await fetch("/api/stats");
    if (!res.ok) return;
    state.stats = await res.json();
    if (state.screen === "landing") render();
  } catch {
    // stats are decorative; never block the landing page on them
  }
}

const app = document.getElementById("app")!;

function playerIdKey(roomCode: string) {
  return `wm_playerId_${roomCode}`;
}

function getOrCreatePlayerId(roomCode: string): string {
  const key = playerIdKey(roomCode);
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function randomRoomCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) code += letters[Math.floor(Math.random() * letters.length)];
  return code;
}

function joinRoom(roomCode: string, name: string) {
  state.roomCode = roomCode.toUpperCase();
  state.name = name;
  localStorage.setItem("wm_name", name);
  state.playerId = getOrCreatePlayerId(state.roomCode);
  state.screen = "connecting";
  render();

  const conn = connect(
    state.roomCode,
    (msg) => handleServerMessage(msg),
    () => {
      state.error = "Disconnected from the meeting. Reconnecting...";
      render();
      setTimeout(() => {
        if (state.roomCode) joinRoom(state.roomCode, state.name);
      }, 1500);
    }
  );
  state.conn = conn;
  conn.socket.addEventListener("open", () => {
    conn.send({ type: "join", playerId: state.playerId, name: state.name });
  });
}

function handleServerMessage(msg: ServerMessage) {
  if (msg.type === "lobby") {
    state.lobby = msg;
    state.game = null;
    state.screen = "lobby";
    state.error = null;
    // Quick Start: I'm alone in a fresh room -> fill it with 4 bots and go.
    if (state.quickStart && msg.youId === msg.hostId) {
      const bots = msg.players.filter((p) => p.isBot).length;
      if (bots < 4) {
        state.conn?.send({ type: "add-bot" });
      } else {
        state.quickStart = false;
        state.conn?.send({ type: "start" });
      }
    }
  } else if (msg.type === "state") {
    state.game = msg.state;
    state.screen = "game";
    state.error = null;
    if (msg.state.phase !== "commit") {
      state.selectedCardId = null;
    }
  } else if (msg.type === "reveal") {
    // Captured before this message can be followed by a 'state' message with the
    // round's new values (the server always broadcasts reveal, then state -- see
    // MeetingRoom.ts). Keeps the board frozen at pre-round values while the reveal
    // overlay plays, so the value-change tweens have something to animate FROM once it clears.
    preRoundGameSnapshot = state.game;
    state.reveal = msg.reveal;
    state.revealVisible = true;
    // The winning card is meant to be actually READ now, so the auto-dismiss is long
    // and the Continue button is the expected way out.
    const holdMs = Math.min(14000, 6000 + msg.reveal.plays.length * 400);
    const shownReveal = msg.reveal;
    setTimeout(() => {
      if (state.reveal !== shownReveal || !state.revealVisible) return; // already dismissed or superseded
      state.revealVisible = false;
      render();
    }, holdMs);
  } else if (msg.type === "chat") {
    state.chat.messages.push(msg.chat);
    if (state.chat.messages.length > 50) state.chat.messages.shift();
    if (!state.chat.open) state.chat.unread += 1;
  } else if (msg.type === "error") {
    state.error = msg.message;
  }
  render();
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Pre-round board snapshot, held while the reveal overlay is up so the underlying
 * board stays visually frozen at old values instead of jumping to new ones the instant
 * the server's 'state' message arrives (which happens while the overlay is still showing). */
let preRoundGameSnapshot: ClientGameState | null = null;

function render() {
  if (state.screen === "landing") app.innerHTML = renderLanding();
  else if (state.screen === "connecting") app.innerHTML = renderConnecting();
  else if (state.screen === "lobby") app.innerHTML = renderLobby();
  else if (state.screen === "game" && state.game) {
    if (state.game.phase === "ended") app.innerHTML = renderEnd(state.game);
    else if (state.game.phase === "draft") app.innerHTML = renderDraft(state.game);
    else {
      const boardToShow = state.revealVisible && preRoundGameSnapshot ? preRoundGameSnapshot : state.game;
      app.innerHTML = renderGame(boardToShow);
    }
  }
  if (state.reveal && state.revealVisible) {
    app.insertAdjacentHTML("beforeend", renderRevealOverlay(state.reveal));
  }
  if (state.showHelp) {
    app.insertAdjacentHTML("beforeend", renderHelpModal());
  }
  if (state.screen === "lobby" || state.screen === "game") {
    app.insertAdjacentHTML("beforeend", renderChatDock());
  }
  attachHandlers();
  runEntryAnimations();
}

/** Everyone at the table you could name in a message -- other players only; taunting
 * yourself is a bridge too far even for this office. */
function chatPlayerOptions(): string[] {
  const meId = state.playerId;
  if (state.game) return state.game.players.filter((p) => p.id !== meId).map((p) => p.name);
  return (state.lobby?.players ?? []).filter((p) => p.id !== meId).map((p) => p.name);
}

function chatSlotOptions(slot: (typeof CHAT_TEMPLATES)[number]["slots"][number]): string[] {
  if (slot.kind === "topic") return [...TOPICS];
  if (slot.kind === "player") return chatPlayerOptions();
  return slot.options;
}

/** Live preview of the composed line, with unfilled slots shown as blanks. */
function chatPreview(): string {
  const t = state.chat.composeTemplateId ? chatTemplateById(state.chat.composeTemplateId) : null;
  if (!t) return "";
  return t.parts.map((p) => (typeof p === "number" ? state.chat.composeValues[p] || "____" : p)).join("");
}

/** The floating table-talk drawer: a feed of everyone's (and every bot's) lines, plus
 * the madlibs builder -- pick a line, fill its blanks from dropdowns, send. No free
 * text anywhere. */
function renderChatDock(): string {
  const c = state.chat;
  if (!c.open) {
    return `
      <button class="chat-toggle" data-action="chat-toggle" title="Table talk">
        &#128172;${c.unread > 0 ? `<span class="chat-badge">${c.unread}</span>` : ""}
      </button>
    `;
  }
  const template = c.composeTemplateId ? chatTemplateById(c.composeTemplateId) : null;
  const canSend = !!template && template.slots.every((_, i) => !!c.composeValues[i]);
  return `
    <div class="chat-panel">
      <div class="chat-header">
        <span>&#128172; Table talk</span>
        <button class="secondary chat-close" data-action="chat-toggle">&#10005;</button>
      </div>
      <div class="chat-feed" id="chat-feed">
        ${
          c.messages.length === 0
            ? `<p class="hint">Nothing said yet. Set the tone.</p>`
            : c.messages
                .map(
                  (m) => `<div class="chat-msg ${m.senderId === state.playerId ? "mine" : ""}">
                    <span class="chat-avatar">${m.avatar}</span>
                    <span class="chat-body"><b>${esc(m.senderName)}</b> ${esc(m.text)}</span>
                  </div>`
                )
                .join("")
        }
      </div>
      <div class="chat-compose">
        <select data-action="chat-template" aria-label="Pick a line">
          <option value="">Say something&hellip;</option>
          ${CHAT_TEMPLATES.map((t) => {
            const label = t.parts.map((p) => (typeof p === "number" ? "____" : p)).join("");
            return `<option value="${t.id}" ${t.id === c.composeTemplateId ? "selected" : ""}>${esc(label)}</option>`;
          }).join("")}
        </select>
        ${
          template
            ? template.slots
                .map((slot, i) => {
                  const options = chatSlotOptions(slot);
                  return `<select data-action="chat-slot" data-slot-index="${i}" aria-label="Fill in blank ${i + 1}">
                    <option value="">${slot.kind === "topic" ? "which topic?" : slot.kind === "player" ? "who?" : "pick one"}</option>
                    ${options.map((o) => `<option value="${esc(o)}" ${o === c.composeValues[i] ? "selected" : ""}>${esc(o)}</option>`).join("")}
                  </select>`;
                })
                .join("")
            : ""
        }
        ${template ? `<div class="chat-preview">${esc(chatPreview())}</div>` : ""}
        <button data-action="chat-send" ${canSend ? "" : "disabled"}>Send</button>
      </div>
    </div>
  `;
}

/** Kicks off whatever juice belongs to the screen that was just rendered. Runs after
 * every render() call; each branch no-ops if its markup isn't present, so this stays a
 * single dispatch point instead of scattering animation calls through the render*()
 * functions themselves (which only build HTML strings, not live DOM). */
function runEntryAnimations() {
  if (state.reveal && state.revealVisible) {
    // Deliberately slower stagger than other screens: each play flips over one at a
    // time (weakest first, winner last -- see renderRevealOverlay's sort), THEN the
    // outcome banner announces the result, color-coded by what actually happened.
    const plays = app.querySelectorAll(".reveal-play");
    staggerIn(plays, { stagger: 0.22, y: 10 });
    const afterPlays = plays.length * 0.22 + 0.15;
    const winnerEl = app.querySelector(".reveal-play.winner");
    if (winnerEl) glowPulse(winnerEl, { delay: afterPlays });
    popIn(app.querySelector(".reveal-winner-section"), { delay: afterPlays + 0.3 });
    popIn(app.querySelector(".reveal-outcome-banner"), { delay: afterPlays + 0.3 });
    return;
  }

  if (state.screen === "game" && state.game && !state.revealVisible && preRoundGameSnapshot) {
    animateBoardDiff(preRoundGameSnapshot, state.game);
    preRoundGameSnapshot = null;
    return;
  }

  if (state.screen === "game" && state.game?.phase === "draft") {
    staggerIn(app.querySelectorAll(".draft-cards .card"), { stagger: 0.015, y: 8, duration: 0.25 });
  }

  if (state.screen === "game" && state.game?.phase === "ended") {
    staggerIn(app.querySelectorAll(".agenda-reveal-player"), { stagger: 0.1, y: 12 });
  }

  if (state.screen === "game" && state.game?.pendingVote) {
    staggerIn(app.querySelectorAll(".vote-candidates .card"), { stagger: 0.08 });
  }
}

/** Tweens every number on the board (Duration, Fatigue, each player's Stamina) from its
 * pre-round value to its post-round value. Called once, right as the reveal overlay
 * clears. */
function animateBoardDiff(prev: ClientGameState, curr: ClientGameState) {
  tweenNumber(app.querySelector(".duration strong"), prev.duration, curr.duration);
  tweenNumber(app.querySelector(".fatigue strong"), prev.fatigue, curr.fatigue);

  for (const topic of TOPICS) {
    const prevT = prev.topics[topic];
    const currT = curr.topics[topic];
    if (prevT.agreement === currT.agreement && prevT.pressure === currT.pressure) continue;
    const col = app.querySelector(`.minutes-col[data-topic="${topic}"]`);
    flash(col, "flash-up");
    tweenWidth(col?.querySelector(".axis-fill.agreement") ?? null, pts(prevT.agreement), pts(currT.agreement));
    tweenWidth(col?.querySelector(".axis-fill.pressure") ?? null, pts(prevT.pressure), pts(currT.pressure));
    tweenNumber(col?.querySelector(".axis-value.agreement") ?? null, pts(prevT.agreement), pts(currT.agreement));
    tweenNumber(col?.querySelector(".axis-value.pressure") ?? null, pts(prevT.pressure), pts(currT.pressure));
  }

  for (const p of curr.players) {
    const prevPlayer = prev.players.find((pp) => pp.id === p.id);
    if (!prevPlayer || prevPlayer.stamina === p.stamina) continue;
    const badge = app.querySelector(`.player-chip[data-player-id="${p.id}"] .stamina-badge strong`);
    tweenNumber(badge, prevPlayer.stamina, p.stamina);
  }
}

function renderHelpModal(): string {
  return `
    <div class="help-overlay">
      <div class="help-box">
        <div class="help-header">
          <h2>How Work Meeting Works</h2>
          <button class="secondary" data-action="close-help">Got it</button>
        </div>
        <div class="help-body">
          <p>Everyone's in the same meeting, sharing the same agenda. Everyone also has a private <strong>Hidden Agenda</strong> they'll never say out loud &mdash; and it's built to put you at odds with at least one other player, whether you realize it or not.</p>

          <h3>Hidden Agenda</h3>
          <p>Yours is a 2x2 card of 4 cells &mdash; all 4 Topics, each with a stance: <strong>Approve</strong> it (get it to Approved by the end) or <strong>Reject</strong> it (keep it from being Approved). At the end of the meeting, <strong>whoever completed the most of their 4 cells wins</strong> (ties share it). But first the room has to survive at all: if fewer than 2 Topics end Approved, the meeting failed and <strong>nobody</strong> wins. Nobody shares your exact card, and whenever two players share a Topic, they're usually pulling it in opposite directions.</p>

          <h3>Drafting your deck</h3>
          <p>Before the meeting starts, you're shown your Hidden Agenda card and the whole table takes turns drafting cards, one at a time, into a personal deck (everyone can see the shared pool and who's picking what &mdash; once a card is taken, it's gone for everyone else). Build your deck around your Hidden Agenda. You only draw from and play the cards you drafted for the rest of the match.</p>

          <h3>The Board</h3>
          <p>There are 4 Topics: Budget, Timeline, Personnel, Strategy. Every Topic has two dials:</p>
          <ul class="help-list">
            <li><strong>Agreement</strong> &mdash; once it's at or above the threshold shown on the board, the Topic reads as <strong>Approved</strong>, live, at all times. It's not locked in &mdash; it can drop back below and un-Approve just as easily as it rose.</li>
            <li><strong>Pressure</strong> &mdash; the higher this is, the less any single play actually moves that Topic's Agreement, in either direction. High Pressure is what makes an Approved Topic hard to knock back down &mdash; or a Rejected one hard to budge up.</li>
          </ul>
          <p>The table wins together if <strong>2 or more of the 4 Topics are currently Approved</strong> when the meeting ends &mdash; that's the Shared Agenda.</p>

          <h3>Every card is a transfer</h3>
          <p>There's no separate legality system. Every card takes some amount off one Topic's Agreement or Pressure (the cost) and gives it to another Topic's Agreement or Pressure (the benefit). A card is only legal to play if its cost side can actually be paid &mdash; if the Topic doesn't have enough there (or is too pressured to give any up), the card's illegal. Since the cost side looks the same whether you're "just paying" or deliberately weakening a Topic you want kept down, nobody can be sure why you played what you played.</p>

          <h3>Stamina &amp; bidding</h3>
          <p>Everyone has a <strong>Stamina</strong> pool. When you pick a card, you also choose how much Stamina to bid &mdash; <strong>at least 1</strong>, up to your whole pool. Highest bid wins the floor, and its card just happens &mdash; no hidden check, no chance to fail once you've won priority. <strong>The Chair's bid always counts as 1 higher than shown</strong> (&#128081;) &mdash; so what looks like a tie against the Chair isn't one.</p>
          <p>Whatever you bid is spent, win or lose. If you get <strong>talked over</strong>, you get back the card's printed <strong>Stamina Return</strong> as a consolation, so a losing bid nets Return minus what you spent. If you <strong>win</strong>, you pay your full bid, no Return &mdash; winning is what actually moves the board, and that's the cost of it.</p>
          <p>At <strong>0 Stamina you can't play a card at all</strong> &mdash; you have to Pass, which banks a flat +5 Stamina. That's the whole recovery loop: talk less, recover more.</p>

          <h3>Each round</h3>
          <p>Everyone secretly picks a card and a bid (or Passes). Then everyone reveals at once. The highest bid wins the floor and actually happens &mdash; everyone else got talked over.</p>
          <p>Before locking in, you can also <strong>discard &amp; draw</strong>: swap one card for a fresh one at 1 Stamina, once per round. It's a free action &mdash; you still play (or Pass) that same round.</p>
          <p><strong>Ties</strong>: if 2+ people genuinely tie for the top bid (after the Chair's +1), everyone <em>not</em> in the tie votes on whose card gets heard. If that vote is also tied, only then does it fall back to whoever's closest to the rotating Chair (&#128081;).</p>

          <h3>Reading a card</h3>
          <ul class="help-list">
            <li>&#9203; <strong>Sustain</strong> &mdash; if you win: spends that much of the shared Duration clock. Every card has one, transfers and bonus cards alike.</li>
            <li><strong>Stamina Return</strong> &mdash; how much Stamina flows back to you if this card wins the floor.</li>
          </ul>

          <h3>Bonus cards</h3>
          <p>A few cards aren't transfers at all: <strong>Extend the Meeting</strong> adds to the shared Duration clock; <strong>Fast-Track It</strong> and <strong>Bury It in Committee</strong> halve or double the Duration cost of whichever card wins the very next round, anywhere at the table; <strong>Strike That From the Minutes</strong> and <strong>On Second Thought</strong> undo whatever the single most recent winning play did. Only the last play can ever be undone, and undoing doesn't chain.</p>

          <h3>Duration</h3>
          <p>A shared clock for the whole table. Every winning card spends it out of its own Sustain. If it runs out and nobody has a legal move left, the meeting's over &mdash; check the Shared Agenda and everyone's Hidden Agenda to see how it went.</p>
        </div>
        <button data-action="close-help">Got it, let's go</button>
      </div>
    </div>
  `;
}

function renderLanding(): string {
  const stats = state.stats;
  const statsLine =
    stats && stats.players > 0
      ? `<span class="live-dot"></span> ${stats.rooms} meeting${stats.rooms === 1 ? "" : "s"} in progress &middot; ${stats.players} ${stats.players === 1 ? "person" : "people"} pretending to work`
      : `<span class="live-dot idle"></span> The office is quiet right now &mdash; start the first meeting of the day`;
  return `
    <div class="screen landing">
      <header class="landing-topbar">
        <div class="landing-logo">&#128203; Work Meeting</div>
        <div class="live-stats" title="Live count of rooms with connected players">${statsLine}</div>
        <button class="secondary help-btn" data-action="open-help">How to Play</button>
      </header>

      <section class="hero">
        <h1>This meeting could have<br />been a <em>card game</em>.</h1>
        <p class="tagline">A social-deduction card game for 2-6 coworkers. Everyone shares the same agenda. Everyone has a private one. Nobody says what they actually want out loud.</p>
        ${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}
        <form id="quick-start-form" class="quick-start">
          <input id="quick-name" maxlength="20" value="${esc(state.name)}" placeholder="Your name" aria-label="Your name" />
          <button type="submit" class="cta">&#9889; Quick Start &mdash; solo vs. 4 bots</button>
        </form>
        <p class="hint hero-hint">No signup, no download. One click and you're in a meeting.</p>
      </section>

      <section class="how-it-works">
        <div class="how-card">
          <div class="how-emoji">&#128451;</div>
          <h3>1 &middot; Draft your deck</h3>
          <p>You're dealt a secret <strong>Hidden Agenda</strong> &mdash; which 2 of the 4 Topics you need Approved, and which 2 you need buried. Then draft 16 cards to pull it off.</p>
        </div>
        <div class="how-card">
          <div class="how-emoji">&#128227;</div>
          <h3>2 &middot; Bid for the floor</h3>
          <p>Each round, everyone secretly picks a card and bids <strong>Stamina</strong>. Loudest voice wins the floor and their card actually happens. Everyone else got talked over.</p>
        </div>
        <div class="how-card">
          <div class="how-emoji">&#128373;</div>
          <h3>3 &middot; Nobody knows why</h3>
          <p>Every card pays a cost that looks identical whether you're helping the room or quietly sabotaging a Topic. Read the table. Trust no one's stated reasons.</p>
        </div>
      </section>

      <section class="landing-forms">
        <form id="create-form" class="panel">
          <h2>Start a meeting with friends</h2>
          <label>Your name<input id="create-name" maxlength="20" required value="${esc(state.name)}" placeholder="e.g. Priya" /></label>
          <button type="submit">Create Meeting</button>
          <p class="hint">You'll get a 4-letter room code to share. Add bots to fill empty seats.</p>
        </form>
        <form id="join-form" class="panel">
          <h2>Join a meeting</h2>
          <label>Room code<input id="join-code" maxlength="4" required placeholder="ABCD" style="text-transform:uppercase" /></label>
          <label>Your name<input id="join-name" maxlength="20" required value="${esc(state.name)}" placeholder="e.g. Devon" /></label>
          <button type="submit">Join Meeting</button>
        </form>
      </section>
    </div>
  `;
}

function renderConnecting(): string {
  return `<div class="screen"><p>Joining the meeting${state.error ? `: <span class="error">${esc(state.error)}</span>` : "..."}</p></div>`;
}

function renderLobby(): string {
  const l = state.lobby!;
  const canStart = l.players.length >= 2;
  const canAddBot = l.players.length < 6;
  const isHost = l.youId === l.hostId;
  return `
    <div class="screen lobby">
      <div class="title-row">
        <h1>Meeting Lobby</h1>
        <button class="secondary help-btn" data-action="open-help">How to Play</button>
      </div>
      <div class="room-code">Room code: <span>${esc(l.roomCode)}</span> <button data-action="copy-code">Copy</button></div>
      ${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}
      <ul class="player-list">
        ${l.players
          .map(
            (p) =>
              `<li class="${p.connected ? "" : "disconnected"}">${p.isBot ? "&#129302; " : ""}${esc(p.name)}${p.id === l.youId ? " (you)" : ""}${p.id === l.hostId ? " &mdash; host" : ""}
                ${p.isBot && isHost ? `<button class="secondary remove-bot" data-action="remove-bot" data-player-id="${p.id}">Remove</button>` : ""}
              </li>`
          )
          .join("")}
      </ul>
      <p class="hint">2-6 people (bots welcome). Once you start, everyone secretly picks one card per round &mdash; see "How to Play" if you're new.</p>
      <div class="lobby-actions">
        <button data-action="start" ${canStart ? "" : "disabled"}>Start Meeting</button>
        <button data-action="add-bot" class="secondary" ${canAddBot ? "" : "disabled"}>Add Bot</button>
      </div>
    </div>
  `;
}

function topicColor(topic: Topic | null): string {
  const map: Record<Topic, string> = {
    Budget: "#3fae6a",
    Timeline: "#3f8cae",
    Personnel: "#9a5fc9",
    Strategy: "#c98a3f",
  };
  return topic ? map[topic] : "#888";
}

/** Pastel sticky-note colors for the card face, one hue family per topicColor() so a card
 * in hand still visually pairs with its column on the board. Cards keep a small rotation
 * per-id (not per-render) so the same card doesn't visibly jitter between re-renders. */
function topicNoteColor(topic: Topic | null): string {
  const map: Record<Topic, string> = {
    Budget: "#CFE8CE",
    Timeline: "#C9E1F2",
    Personnel: "#DCD2ED",
    Strategy: "#F3D9B8",
  };
  return topic ? map[topic] : "#E9E6DA";
}

function noteRotation(cardId: string): number {
  let hash = 0;
  for (let i = 0; i < cardId.length; i++) hash = (hash * 31 + cardId.charCodeAt(i)) | 0;
  return ((hash % 7) - 3) * 0.6; // -1.8deg .. 1.8deg
}

/** Every Agreement/Pressure/transferAmount/approveThreshold value is a 0-1 float
 * internally (that's what the engine balances against), but raw decimals ("0.3") read
 * badly in a UI. Display everything as a rounded 0-100 point scale instead -- pure
 * presentation, no balance change. */
function pts(v: number): number {
  return Math.round(v * 100);
}

const TOPIC_ABBR: Record<Topic, string> = { Budget: "BU", Timeline: "TI", Personnel: "PE", Strategy: "ST" };
const AXIS_ICON: Record<"Agreement" | "Pressure", string> = { Agreement: "\u{1F91D}", Pressure: "⚖️" };

function topicChip(topic: Topic): string {
  return `<span class="topic-chip" style="background:${topicColor(topic)}" title="${topic}">${TOPIC_ABBR[topic]}</span>`;
}

/** Compact symbol rendering of a card's effect -- topic chip + axis icon + signed point
 * value, cost side arrow benefit side for transfers. Replaces the old full-sentence
 * effect text on the card face (still available as a tooltip via card.effectText). */
function renderEffectSymbols(card: CardDef): string {
  const e = card.effect;
  if (e.kind === "transfer") {
    const amt = pts(e.amount);
    return `
      <span class="fx-side">${topicChip(e.costTopic)}<span class="fx-axis">${AXIS_ICON[e.costAxis]}</span><span class="fx-num neg">&minus;${amt}</span></span>
      <span class="fx-arrow">&#10132;</span>
      <span class="fx-side">${topicChip(e.benefitTopic)}<span class="fx-axis">${AXIS_ICON[e.benefitAxis]}</span><span class="fx-num pos">+${amt}</span></span>
    `;
  }
  if (e.kind === "extendDuration") {
    return `<span class="fx-icon">&#9203;</span><span class="fx-num pos">+${e.amount}</span> <span class="fx-label">Duration</span>`;
  }
  if (e.kind === "durationMultiplier") {
    return `<span class="fx-icon">&#9203;</span><span class="fx-num">&times;${e.multiplier}</span> <span class="fx-label">next winning play</span>`;
  }
  return `<span class="fx-icon">&#8634;</span> <span class="fx-label">undo last play</span>`;
}

function yourSeat(g: ClientGameState): number {
  return g.players.find((p) => p.id === g.you.id)?.seat ?? 0;
}

/** The Topic a transfer card's benefit lands on, used purely to color/group the card --
 * bonus cards (extend/multiplier/undo) have no single Topic, so they group as "Universal". */
function cardPrimaryTopic(card: CardDef): Topic | null {
  return card.effect.kind === "transfer" ? card.effect.benefitTopic : null;
}

function transferPayableGuess(effect: Extract<CardEffect, { kind: "transfer" }>, g: ClientGameState): boolean {
  const t = g.topics[effect.costTopic];
  const removal = effect.costAxis === "Agreement" ? effect.amount * (1 - t.pressure) : effect.amount;
  if (removal <= 1e-9) return false;
  const current = effect.costAxis === "Agreement" ? t.agreement : t.pressure;
  return current >= removal - 1e-9;
}

/** Best-effort client-side legality preview; the server is authoritative and will reject illegal commits. */
function cardIsLegalGuess(card: CardDef, g: ClientGameState): boolean {
  if (card.sustain > g.duration) return false;
  switch (card.effect.kind) {
    case "transfer":
      return transferPayableGuess(card.effect, g);
    case "extendDuration":
    case "durationMultiplier":
      return true;
    case "undo":
      return g.hasUndoTarget;
  }
}

/** Explains why an illegal card is illegal right now, for display next to the card. Returns null if legal. */
function illegalReason(card: CardDef, g: ClientGameState): string | null {
  if (cardIsLegalGuess(card, g)) return null;
  if (card.sustain > g.duration) return `Needs ${card.sustain} Duration, only ${g.duration} left.`;
  if (card.effect.kind === "transfer") {
    const t = g.topics[card.effect.costTopic];
    const current = pts(card.effect.costAxis === "Agreement" ? t.agreement : t.pressure);
    return `${card.effect.costTopic} only has ${current} ${card.effect.costAxis} left to pay this cost with.`;
  }
  if (card.effect.kind === "undo") return "Nothing to undo yet.";
  return null;
}

function renderCard(
  card: CardDef,
  opts: {
    selected?: boolean;
    legal?: boolean;
    faded?: boolean;
    conditionTitle?: string;
    /** Shows a small "discard for a new card" button on the card face -- only sensible
     * in the hand, and only while not mid-selection for an actual play. */
    showDiscardButton?: boolean;
  } = {}
): string {
  const cls = ["card"];
  if (opts.selected) cls.push("selected");
  if (opts.legal === false) cls.push("illegal");
  if (opts.faded) cls.push("faded");

  const conditionOk = opts.legal !== false;
  const effectTitle = !conditionOk && opts.conditionTitle ? opts.conditionTitle : card.effectText;
  const conditionTitleAttr = ` title="${esc(effectTitle)}"`;

  return `
    <div class="${cls.join(" ")}" data-card-id="${card.id}"
         style="--note-color:${topicNoteColor(cardPrimaryTopic(card))};--note-rotate:${noteRotation(card.id)}deg">
      <div class="card-pin"></div>
      <div class="card-name">${esc(card.name)}</div>
      <div class="card-stats">
        <div class="card-stat" title="Sustain: costs this much Duration if this card wins the round"><b>${card.sustain}</b><i class="card-stat-icon">&#8987;</i></div>
        <div class="card-stat" title="Stamina Return: how much Stamina flows back to you if this card wins priority"><b>${card.staminaReturn}</b><i class="card-stat-icon">&#10133;</i></div>
      </div>
      <div class="card-row card-effect-symbols ${conditionOk ? "ok" : "blocked"}"${conditionTitleAttr}>${renderEffectSymbols(card)}</div>
      <div class="card-flavor">${esc(card.flavorText)}</div>
      ${
        opts.showDiscardButton
          ? `<button class="card-discard-btn" data-action="discard-swap" data-card-id="${card.id}" title="Swap this card for a fresh draw (1 Stamina, once per round). You still play or Pass this round afterward.">&#8635; Discard &amp; draw (&#8722;1 &#9889;)</button>`
          : ""
      }
    </div>
  `;
}

/** Renders a player's 4-cell Agenda Card as a 2x2 grid. `showAchieved` colors cells
 * hit/missed (end-of-game recap, where each cell already carries its final `achieved`
 * flag). Passing `topics`/`threshold` adds a live per-cell hint (already Approved or
 * not, matching or opposing this player's stance) -- Topics are public to everyone
 * already, so this leaks no private info beyond the stance itself. */
function renderAgendaGrid(
  cells: (AgendaCell | AgendaCellResult)[],
  opts: { showAchieved?: boolean; topics?: ClientGameState["topics"]; threshold?: number } = {}
): string {
  return `
    <div class="agenda-grid">
      ${cells
        .map((c) => {
          const achieved = opts.showAchieved ? (c as AgendaCellResult).achieved : undefined;
          const resultClass = achieved === undefined ? "" : achieved ? "achieved" : "missed";
          let liveHint = "";
          if (opts.topics && opts.threshold !== undefined) {
            const approved = opts.topics[c.topic].agreement >= opts.threshold;
            const onTrack = c.stance === "Approve" ? approved : !approved;
            liveHint = `${approved ? "Approved" : "Not approved"} ${onTrack ? "&#10003;" : "&#10007;"}`;
          }
          return `
            <div class="agenda-cell stance-${c.stance.toLowerCase()} ${resultClass}" style="--topic-color:${topicColor(c.topic)}" title="${esc(agendaCellLabel(c))}">
              <div class="agenda-cell-topic">${c.topic}</div>
              <div class="agenda-cell-stance">${c.stance}</div>
              ${liveHint ? `<div class="agenda-cell-hint">${liveHint}</div>` : ""}
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderTopicsBoard(g: ClientGameState): string {
  const threshold = g.config.approveThreshold;
  return `
    <div class="minutes-board">
      ${TOPICS.map((topic) => {
        const t = g.topics[topic];
        const approved = t.agreement >= threshold;
        const creditName = t.credit ? g.players.find((p) => p.id === t.credit)?.name ?? "?" : null;
        return `
          <div class="minutes-col ${approved ? "approved" : ""}" data-topic="${topic}" style="--topic-color:${topicColor(topic)}">
            <div class="minutes-topic">${topic}</div>
            <div class="axis-bar" title="Agreement -- reads as Approved live once it crosses ${pts(threshold)}, and can drop back below it just as easily">
              <span class="axis-label">Agreement <b class="axis-value agreement">${pts(t.agreement)}</b> <span class="hint">/ ${pts(threshold)} to Approve</span></span>
              <div class="axis-track">
                <div class="axis-fill agreement" style="width:${pts(t.agreement)}%"></div>
                <div class="axis-threshold" style="left:${pts(threshold)}%"></div>
              </div>
            </div>
            <div class="axis-bar" title="Pressure -- dampens how much an Agreement change actually applies, in either direction">
              <span class="axis-label">Pressure <b class="axis-value pressure">${pts(t.pressure)}</b></span>
              <div class="axis-track"><div class="axis-fill pressure" style="width:${pts(t.pressure)}%"></div></div>
            </div>
            <div class="minutes-status ${approved ? "status-approved" : ""}">${approved ? "Approved" : "Not approved"}</div>
            ${creditName ? `<div class="minutes-credit" title="Who moved this Topic last">Last: ${esc(creditName)}</div>` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderDraft(g: ClientGameState): string {
  const d = g.draft!;
  const you = g.you;
  const isYourTurn = d.turnPlayerId === you.id;
  const turnPlayerName = d.turnPlayerId ? g.players.find((p) => p.id === d.turnPlayerId)?.name ?? "?" : null;

  const groups: { label: string; topic: Topic | null; cards: CardDef[] }[] = [
    ...TOPICS.map((t) => ({ label: t, topic: t, cards: d.pool.filter((c) => cardPrimaryTopic(c) === t) })),
    { label: "Universal", topic: null, cards: d.pool.filter((c) => cardPrimaryTopic(c) === null) },
  ].filter((grp) => grp.cards.length > 0);

  return `
    <div class="screen draft">
      <div class="title-row">
        <h1>Draft Your Deck</h1>
        <button class="secondary help-btn" data-action="open-help">?</button>
      </div>
      <div class="hidden-agenda draft-agenda">
        Your Hidden Agenda <span class="hint">(private &mdash; draft around it. Whoever completes the most cells wins.)</span>
        ${renderAgendaGrid(you.agendaCard)}
      </div>

      <div class="draft-status">
        ${
          isYourTurn
            ? `<div class="draft-turn you">Your pick (${d.yourDeck.length}/${d.deckSize})</div>
               <button class="secondary" data-action="draft-auto-pick" title="Grabs the available card that best fits your Hidden Agenda">&#10024; Choose for me</button>`
            : `<div class="draft-turn">Waiting on ${esc(turnPlayerName ?? "...")}&rsquo;s pick&hellip;</div>`
        }
      </div>

      <section class="players-panel">
        ${d.playerPickCounts
          .map((p) => `<div class="player-chip ${p.playerId === d.turnPlayerId ? "you" : ""}">${esc(p.playerName)} &middot; ${p.count}/${d.deckSize}</div>`)
          .join("")}
      </section>

      <div class="draft-layout">
        <div class="draft-pool">
          ${groups
            .map(
              (grp) => `
            <div class="draft-group">
              <div class="draft-group-label" style="color:${topicColor(grp.topic)}">${grp.label}</div>
              <div class="draft-cards">
                ${grp.cards.map((c) => renderCard(c, { faded: !isYourTurn })).join("")}
              </div>
            </div>
          `
            )
            .join("")}
        </div>

        <div class="draft-your-deck">
          <h3>Your deck so far (${d.yourDeck.length}/${d.deckSize})</h3>
          <div class="draft-deck-list">
            ${d.yourDeck.map((c) => `<div class="draft-deck-chip" style="--topic-color:${topicColor(cardPrimaryTopic(c))}">${esc(c.name)} <span class="hint">${cardPrimaryTopic(c) ?? "Universal"}</span></div>`).join("") || `<p class="hint">Nothing yet.</p>`}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderVotePanel(g: ClientGameState): string {
  const vote = g.pendingVote!;
  const waitingOn = vote.voterIds
    .filter((id) => !vote.votes.some((v) => v.voterId === id))
    .map((id) => g.players.find((p) => p.id === id)?.name ?? "?");

  if (!vote.youAreVoter) {
    return `
      <div class="vote-panel">
        <h3 title="Two or more players tied for the highest effective Attack this round.">It's a tie for the floor!</h3>
        <p class="hint">Your card is one of the tied plays. Everyone not involved is voting on which one wins &mdash; ${vote.votes.length}/${vote.voterIds.length} votes in.</p>
        <div class="vote-candidates">
          ${vote.candidates.map((c) => renderVoteCandidateCard(c, false)).join("")}
        </div>
      </div>
    `;
  }
  if (vote.youHaveVoted) {
    return `
      <div class="vote-panel">
        <h3>It's a tie for the floor!</h3>
        <p class="hint">Vote cast. Waiting on: ${waitingOn.length > 0 ? waitingOn.map((n) => esc(n)).join(", ") : "nobody &mdash; resolving..."}</p>
        <div class="vote-candidates">
          ${vote.candidates.map((c) => renderVoteCandidateCard(c, false)).join("")}
        </div>
      </div>
    `;
  }
  return `
    <div class="vote-panel">
      <h3 title="You aren't part of the tie, so you get to decide whose card is heard.">It's a tie for the floor &mdash; you vote!</h3>
      <p class="hint">Pick whichever tied play you want to win the round.</p>
      <div class="vote-candidates">
        ${vote.candidates.map((c) => renderVoteCandidateCard(c, true)).join("")}
      </div>
    </div>
  `;
}

function renderVoteCandidateCard(c: PendingVoteCandidate, clickable: boolean): string {
  const cardHtml = renderCard(c.card, { legal: true });
  return `
    <div class="vote-candidate-wrap" ${clickable ? `data-action="vote" data-candidate-id="${c.playerId}" title="Vote for ${esc(c.playerName)}'s play to win the floor"` : ""}>
      <div class="vote-candidate-name">${esc(c.playerName)}</div>
      ${cardHtml}
    </div>
  `;
}

/** Both branches always cost the bid; only a loss gets the card's Return back. Shared
 * between the full render and the slider's live-drag patch (see attachHandlers) so the
 * two never drift out of sync. */
function attackSpendPreviewNumbers(card: CardDef, spend: number): { winNet: number; loseNet: number } {
  return { winNet: -spend, loseNet: card.staminaReturn - spend };
}

/** The Attack-spend control: how much of your current Stamina to commit as this round's
 * Attack. Defaults to your full pool when a card is first selected (see the card click
 * handler), adjustable down via the slider. Shows a live preview of the net Stamina
 * change for both outcomes -- a bid is always spent, win or lose; only a loss gets the
 * card's Return back as a consolation. */
function renderAttackSpend(g: ClientGameState, card: CardDef): string {
  const you = g.you;
  const spend = Math.max(1, Math.min(state.selectedAttackSpend, you.stamina));
  const isChairYou = yourSeat(g) === g.chairSeat;
  const { winNet, loseNet } = attackSpendPreviewNumbers(card, spend);
  const loseClass = loseNet > 0 ? "ok" : loseNet < 0 ? "risk" : "";
  return `
    <div class="attack-spend">
      <label for="attack-spend-input">Bid this round: <strong id="attack-spend-value">${spend}</strong> / ${you.stamina} Stamina${isChairYou ? ` <span class="hint">(&#128081; counts as ${spend + 1} &mdash; the Chair's bid is always 1 higher than shown)</span>` : ""}</label>
      <input type="range" id="attack-spend-input" data-action="set-attack-spend" min="1" max="${you.stamina}" value="${spend}" />
      <div class="attack-spend-preview">If you <strong>win</strong>: <strong class="risk">${winNet} Stamina</strong> (full bid, no Return). If <strong>talked over</strong>: Return ${card.staminaReturn} &minus; ${spend} spent = <strong class="${loseClass}">${loseNet > 0 ? "+" : ""}${loseNet} Stamina</strong>.</div>
    </div>
  `;
}

/** One always-on line answering "what's happening and what do I do about it" for the
 * current moment -- the guided-journey spine of the game screen. */
function phaseBanner(g: ClientGameState): string {
  const you = g.you;
  const youCommitted = g.committedPlayerIds.includes(you.id);
  const waiting = g.players.filter((p) => !g.committedPlayerIds.includes(p.id)).length;
  let text: string;
  if (g.pendingVote) {
    text = g.pendingVote.youAreVoter && !g.pendingVote.youHaveVoted
      ? "&#9878;&#65039; Top bids tied &mdash; <strong>you decide</strong> whose card gets heard."
      : "&#9878;&#65039; Top bids tied &mdash; the table is voting on whose card gets heard.";
  } else if (out(g)) {
    text = "&#128564; You're out of Stamina &mdash; <strong>Pass to recover +" + g.config.passReward + " &#9889;</strong>. You can't bid this round.";
  } else if (youCommitted) {
    text = `&#9989; You're locked in. Waiting on <strong>${waiting}</strong> ${waiting === 1 ? "person" : "people"}&hellip;`;
  } else {
    text = "&#128068; Pick a card and choose your bid &mdash; highest bid wins the floor. Or Pass to bank +" + g.config.passReward + " &#9889;.";
  }
  return `<div class="phase-banner">${text}</div>`;
}

function out(g: ClientGameState): boolean {
  return g.you.stamina < 1;
}

function renderGame(g: ClientGameState): string {
  const you = g.you;
  const outOfStamina = out(g);
  const selectedCard = state.selectedCardId ? you.hand.find((c) => c.id === state.selectedCardId) : null;
  const canCommit = state.selectedCardId !== null && !outOfStamina;
  const youCommitted = g.committedPlayerIds.includes(you.id);

  return `
    <div class="screen game">
      <header class="game-header">
        <div class="meta">Room ${esc(state.roomCode)} &middot; Round ${g.round}</div>
        <div class="duration" title="Shared clock for the whole table. Winning plays spend it; only Extend the Meeting / Fast-Track It / Bury It in Committee change the rate.">&#9203; Duration: <strong>${g.duration}</strong></div>
        <div class="fatigue" title="Rises every time someone plays a Duration-economy bonus card">Fatigue: <strong>${g.fatigue}</strong></div>
        <button class="secondary help-btn" data-action="open-help">?</button>
      </header>

      ${phaseBanner(g)}

      ${renderTopicsBoard(g)}

      <section class="players-panel">
        ${g.players
          .map((p, i) => {
            const isChair = i === g.chairSeat;
            const committed = g.committedPlayerIds.includes(p.id);
            return `<div class="player-chip ${p.connected ? "" : "disconnected"} ${p.id === you.id ? "you" : ""}" data-player-id="${p.id}">
              <span class="player-avatar">${p.avatar}</span> ${esc(p.name)}${p.id === you.id ? " (you)" : ""} &middot; ${p.handCount} cards
              ${isChair ? '<span class="chair-badge" title="Holds the Chair this round: every bid they make counts as 1 higher than shown, and they win any leftover ties by seat distance">&#128081; +1 to bids</span>' : ""}
              <span class="stamina-badge" title="Current Stamina -- a bid is always spent, win or lose; only a talked-over play gets its card's Return back">&middot; &#9889; <strong>${p.stamina}</strong></span>
              ${committed ? ' <span class="committed-dot" title="Card locked in for this round">&#10003;</span>' : ""}
            </div>`;
          })
          .join("")}
      </section>

      <section class="hand-panel">
        <div class="hidden-agenda" title="Only you know this. Whoever completes the most cells wins -- but nobody wins if fewer than 2 Topics end Approved.">
          Hidden Agenda <span class="hint">(private &mdash; most cells completed wins)</span>
          ${renderAgendaGrid(you.agendaCard, { topics: g.topics, threshold: g.config.approveThreshold })}
        </div>
        ${
          g.pendingVote
            ? renderVotePanel(g)
            : `${
                state.showHandHint && g.round <= 2 && !youCommitted
                  ? `<div class="hand-hint">Full-color cards are legal to play this round; faded ones would get talked over. Pick one, set your bid, and hit Commit &mdash; or Pass if nothing fits. <button class="secondary" data-action="dismiss-hand-hint">Got it</button></div>`
                  : ""
              }
              ${
                youCommitted
                  ? `<p class="hint">Locked in. Waiting for the rest of the room...</p>`
                  : `<div class="hand">
                      ${you.hand
                        .map((c) => {
                          const legal = cardIsLegalGuess(c, g) && !outOfStamina;
                          return renderCard(c, {
                            selected: c.id === state.selectedCardId,
                            legal,
                            conditionTitle: outOfStamina ? "You're out of Stamina -- Pass to recover." : cardIsLegalGuess(c, g) ? undefined : illegalReason(c, g) ?? undefined,
                            showDiscardButton: !state.selectedCardId && !g.youSwappedThisRound && !outOfStamina,
                          });
                        })
                        .join("")}
                     </div>
                     ${selectedCard && !outOfStamina ? renderAttackSpend(g, selectedCard) : ""}
                     <div class="hand-actions">
                       <button data-action="commit" ${canCommit ? "" : "disabled"} title="${outOfStamina ? "Out of Stamina -- you have to Pass" : "Lock in your selected card and bid for this round"}">Commit Card</button>
                       <button data-action="pass" class="secondary" title="Sit this round out and recover a flat ${g.config.passReward} Stamina">Pass (+${g.config.passReward} &#9889;)</button>
                     </div>`
              }`
        }
      </section>

      <section class="log-panel">
        ${g.log
          .slice()
          .reverse()
          .slice(0, 12)
          .map((l) => `<div class="log-line">${esc(l.text)}</div>`)
          .join("")}
      </section>
    </div>
  `;
}

function avatarFor(playerId: string): string {
  return state.game?.players.find((p) => p.id === playerId)?.avatar ?? "&#129333;";
}

/** A play's bid, spelled out so a Chair win over an apparent tie reads as what it is:
 * "4 + &#128081;1 = 5", not a mysterious 5. */
function bidBreakdown(p: RevealPlay): string {
  return p.chairBonus > 0 ? `${p.baseAttack} <span class="chair-bonus">+ &#128081;1</span> = <strong>${p.effAttack}</strong>` : `<strong>${p.effAttack}</strong>`;
}

function renderRevealOverlay(reveal: RoundReveal): string {
  // Suspense ordering: weakest plays flip over first, the winner lands LAST.
  const sorted = [...reveal.plays].sort((a, b) => (a.isWinner ? 1 : 0) - (b.isWinner ? 1 : 0) || a.effAttack - b.effAttack);
  const winnerCardHtml = reveal.winningCard ? renderCard(reveal.winningCard, { legal: true }) : "";
  const threshold = state.game?.config.approveThreshold ?? 0.7;
  const changesHtml = (reveal.topicChanges ?? [])
    .map((c) => {
      const delta = pts(c.after) - pts(c.before);
      const crossedUp = c.axis === "Agreement" && c.before < threshold && c.after >= threshold;
      const crossedDown = c.axis === "Agreement" && c.before >= threshold && c.after < threshold;
      return `
        <div class="reveal-change">
          ${topicChip(c.topic)}<span class="fx-axis">${AXIS_ICON[c.axis]}</span>
          <span class="reveal-change-nums">${pts(c.before)} <span class="fx-arrow">&#10132;</span> <strong>${pts(c.after)}</strong>
            <span class="fx-num ${delta >= 0 ? "pos" : "neg"}">(${delta >= 0 ? "+" : ""}${delta})</span></span>
          ${crossedUp ? `<span class="reveal-crossed up">now APPROVED</span>` : ""}
          ${crossedDown ? `<span class="reveal-crossed down">no longer Approved</span>` : ""}
        </div>`;
    })
    .join("");

  return `
    <div class="reveal-overlay">
      <div class="reveal-box">
        <div class="reveal-round">Round ${reveal.round} &mdash; the table reveals</div>
        <div class="reveal-plays">
          ${sorted
            .map(
              (p) => `
            <div class="reveal-play ${p.isWinner ? "winner" : "fizzled"}">
              <div class="reveal-avatar">${avatarFor(p.playerId)}</div>
              <div class="reveal-name">${esc(p.playerName)}</div>
              <div class="reveal-card">${esc(p.cardName)}</div>
              <div class="reveal-attack">Bid ${bidBreakdown(p)}${!p.legal ? ` <span class="reveal-illegal">(illegal &mdash; can't win)</span>` : ""}</div>
              <div class="reveal-tag">${p.isWinner ? "&#127942; WON THE FLOOR" : "TALKED OVER"}</div>
            </div>
          `
            )
            .join("")}
          ${reveal.passed.map((name) => `<div class="reveal-play passed"><div class="reveal-name">${esc(name)}</div><div class="reveal-tag">PASSED</div></div>`).join("")}
        </div>
        ${reveal.tieNote ? `<div class="reveal-tie-note" title="How the tie was broken">&#9878;&#65039; ${esc(reveal.tieNote)}</div>` : ""}
        ${
          reveal.winningCard
            ? `<div class="reveal-winner-section">
                 <div class="reveal-winner-header">${reveal.winnerId ? avatarFor(reveal.winnerId) : ""} <strong>${esc(reveal.winnerName ?? "")}</strong>'s card takes effect:</div>
                 <div class="reveal-winner-body">
                   <div class="reveal-winner-card">${winnerCardHtml}</div>
                   ${changesHtml ? `<div class="reveal-changes">${changesHtml}</div>` : ""}
                 </div>
               </div>`
            : `<div class="reveal-outcome-banner">${esc(reveal.outcomeText)}</div>`
        }
        <button class="reveal-continue" data-action="dismiss-reveal">Continue &#8594;</button>
      </div>
    </div>
  `;
}

function renderEnd(g: ClientGameState): string {
  const summary = g.endSummary!;
  const ranked = [...summary.players].sort((a, b) => b.agendaAchievedCount - a.agendaAchievedCount);
  return `
    <div class="screen end">
      <h1>${summary.sharedAgendaSuccess ? "MEETING ADJOURNED" : "The Meeting Failed"}</h1>
      <p class="verdict">
        ${
          summary.sharedAgendaSuccess
            ? `The Shared Agenda was met &mdash; ${summary.approvedCount} Topics were Approved. Whoever completed the most of their Hidden Agenda takes the win.`
            : `Only ${summary.approvedCount} Topic${summary.approvedCount === 1 ? "" : "s"} ended Approved (2 were needed). The room couldn't agree on enough &mdash; <strong>nobody wins</strong>, whatever their Hidden Agendas said.`
        }
      </p>
      <p class="hint">Lasted ${summary.rounds} rounds. Ended: ${summary.reason.replace(/-/g, " ")}.</p>

      ${renderTopicsBoard(g)}

      <h2>Hidden Agendas Revealed</h2>
      <div class="agenda-reveal">
        ${ranked
          .map(
            (p) => `<div class="agenda-reveal-player ${p.agendaSuccess ? "success" : "fail"}">
              <div class="agenda-reveal-header">${avatarFor(p.id)} <strong>${esc(p.name)}</strong>: ${p.agendaAchievedCount}/4 cells &mdash; ${
                p.agendaSuccess ? "&#127942; Winner" : summary.sharedAgendaSuccess ? "Runner-up" : "No winner"
              }</div>
              ${renderAgendaGrid(p.agendaCard, { showAchieved: true })}
            </div>`
          )
          .join("")}
      </div>

      <button data-action="restart">Back to Lobby</button>
    </div>
  `;
}

function attachHandlers() {
  const createForm = document.getElementById("create-form") as HTMLFormElement | null;
  createForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = (document.getElementById("create-name") as HTMLInputElement).value.trim();
    if (!name) return;
    joinRoom(randomRoomCode(), name);
  });

  const joinForm = document.getElementById("join-form") as HTMLFormElement | null;
  joinForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = (document.getElementById("join-code") as HTMLInputElement).value.trim();
    const name = (document.getElementById("join-name") as HTMLInputElement).value.trim();
    if (!code || !name) return;
    joinRoom(code, name);
  });

  app.querySelectorAll<HTMLElement>("[data-action]").forEach((el) => {
    el.addEventListener("click", (event) => {
      const action = el.dataset.action;
      if (action === "discard-swap") {
        event.stopPropagation(); // the button lives inside a .hand .card, which has its own click-to-select listener
        const cardId = el.dataset.cardId!;
        state.conn?.send({ type: "discard-swap", cardId });
        return;
      }
      if (action === "copy-code" && state.lobby) {
        navigator.clipboard?.writeText(state.lobby.roomCode).catch(() => {});
      } else if (action === "start") {
        state.conn?.send({ type: "start" });
      } else if (action === "commit") {
        if (!state.selectedCardId) return;
        state.conn?.send({
          type: "commit",
          cardId: state.selectedCardId,
          attackSpend: state.selectedAttackSpend,
        });
        state.selectedCardId = null;
        state.selectedAttackSpend = 0;
      } else if (action === "pass") {
        state.conn?.send({ type: "commit", cardId: null });
      } else if (action === "restart") {
        state.conn?.send({ type: "restart" });
      } else if (action === "add-bot") {
        state.conn?.send({ type: "add-bot" });
      } else if (action === "remove-bot") {
        const playerId = el.dataset.playerId!;
        state.conn?.send({ type: "remove-bot", playerId });
      } else if (action === "open-help") {
        state.showHelp = true;
        render();
      } else if (action === "close-help") {
        state.showHelp = false;
        localStorage.setItem("wm_seen_tutorial", "1");
        render();
      } else if (action === "dismiss-hand-hint") {
        state.showHandHint = false;
        localStorage.setItem("wm_seen_hand_hint", "1");
        render();
      } else if (action === "vote") {
        const candidatePlayerId = el.dataset.candidateId!;
        state.conn?.send({ type: "vote", candidatePlayerId });
      } else if (action === "draft-auto-pick") {
        state.conn?.send({ type: "draft-auto-pick" });
      } else if (action === "dismiss-reveal") {
        state.revealVisible = false;
        render();
      } else if (action === "chat-toggle") {
        state.chat.open = !state.chat.open;
        if (state.chat.open) state.chat.unread = 0;
        render();
      } else if (action === "chat-send") {
        if (state.chat.composeTemplateId) {
          state.conn?.send({ type: "chat", templateId: state.chat.composeTemplateId, values: state.chat.composeValues });
          state.chat.composeTemplateId = null;
          state.chat.composeValues = [];
          render();
        }
      }
    });
  });

  app.querySelectorAll<HTMLSelectElement>('select[data-action="chat-template"]').forEach((el) => {
    el.addEventListener("change", () => {
      state.chat.composeTemplateId = el.value || null;
      state.chat.composeValues = [];
      render();
    });
  });

  app.querySelectorAll<HTMLSelectElement>('select[data-action="chat-slot"]').forEach((el) => {
    el.addEventListener("change", () => {
      const i = Number(el.dataset.slotIndex);
      state.chat.composeValues[i] = el.value;
      render();
    });
  });

  const quickStartForm = document.getElementById("quick-start-form") as HTMLFormElement | null;
  quickStartForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = (document.getElementById("quick-name") as HTMLInputElement).value.trim() || "New Hire";
    state.quickStart = true;
    joinRoom(randomRoomCode(), name);
  });

  app.querySelectorAll<HTMLElement>(".hand .card").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.cardId!;
      const wasSelected = state.selectedCardId === id;
      state.selectedCardId = wasSelected ? null : id;
      // Default to a full-pool bid whenever a new card is selected; adjustable via the slider.
      state.selectedAttackSpend = wasSelected ? 0 : state.game?.you.stamina ?? 0;
      render();
    });
  });

  const attackSpendInput = document.getElementById("attack-spend-input") as HTMLInputElement | null;
  attackSpendInput?.addEventListener("input", () => {
    // A full render() here would replace the slider's own DOM node mid-drag, which
    // browsers treat as releasing the thumb -- patch just the numbers directly instead,
    // and leave the actual re-render for 'change' (fires once, on release).
    state.selectedAttackSpend = Number(attackSpendInput.value);
    const you = state.game?.you;
    const selectedCard = you?.hand.find((c) => c.id === state.selectedCardId);
    if (!you || !selectedCard) return;
    const spend = Math.max(0, Math.min(state.selectedAttackSpend, you.stamina));
    const { winNet, loseNet } = attackSpendPreviewNumbers(selectedCard, spend);
    const valueEl = document.getElementById("attack-spend-value");
    if (valueEl) valueEl.textContent = String(spend);
    const previewEl = app.querySelector(".attack-spend-preview");
    if (previewEl) {
      const loseClass = loseNet > 0 ? "ok" : loseNet < 0 ? "risk" : "";
      previewEl.innerHTML = `If you <strong>win</strong>: <strong class="risk">${winNet} Stamina</strong> (full bid, no Return). If <strong>talked over</strong>: Return ${selectedCard.staminaReturn} &minus; ${spend} spent = <strong class="${loseClass}">${loseNet > 0 ? "+" : ""}${loseNet} Stamina</strong>.`;
    }
  });
  attackSpendInput?.addEventListener("change", () => render());

  const draft = state.game?.draft;
  if (draft && draft.turnPlayerId === state.game?.you.id) {
    app.querySelectorAll<HTMLElement>(".draft-cards .card").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.cardId!;
        state.conn?.send({ type: "draft-pick", cardId: id });
      });
    });
  }

  // Keep the chat feed pinned to the newest message across full re-renders.
  const chatFeed = document.getElementById("chat-feed");
  if (chatFeed) chatFeed.scrollTop = chatFeed.scrollHeight;
}

render();
fetchStats();
// Keep the landing page's live tracker fresh without hammering the API.
setInterval(() => {
  if (state.screen === "landing") fetchStats();
}, 30000);
