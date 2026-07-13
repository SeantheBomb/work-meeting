import { CardDef, RoundReveal, Topic } from "../../shared/types";
import { ClientGameState, LobbyPlayerView, ServerMessage } from "../../shared/protocol";
import { connect } from "./ws";

const TOPIC_ORDER: Topic[] = ["Budget", "Timeline", "Personnel", "Strategy", "Operations"];

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
  selectedTopic: Topic | null;
  error: string | null;
  showHelp: boolean;
  showHandHint: boolean;
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
  selectedTopic: null,
  error: null,
  showHelp: !localStorage.getItem("wm_seen_tutorial"),
  showHandHint: !localStorage.getItem("wm_seen_hand_hint"),
};

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
  } else if (msg.type === "state") {
    state.game = msg.state;
    state.screen = "game";
    state.error = null;
    if (msg.state.phase !== "commit") {
      state.selectedCardId = null;
      state.selectedTopic = null;
    }
  } else if (msg.type === "reveal") {
    state.reveal = msg.reveal;
    state.revealVisible = true;
    setTimeout(() => {
      state.revealVisible = false;
      render();
    }, 2800);
  } else if (msg.type === "error") {
    state.error = msg.message;
  }
  render();
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function render() {
  if (state.screen === "landing") app.innerHTML = renderLanding();
  else if (state.screen === "connecting") app.innerHTML = renderConnecting();
  else if (state.screen === "lobby") app.innerHTML = renderLobby();
  else if (state.screen === "game" && state.game) {
    app.innerHTML = state.game.phase === "ended" ? renderEnd(state.game) : renderGame(state.game);
  }
  if (state.reveal && state.revealVisible) {
    app.insertAdjacentHTML("beforeend", renderRevealOverlay(state.reveal));
  }
  if (state.showHelp) {
    app.insertAdjacentHTML("beforeend", renderHelpModal());
  }
  attachHandlers();
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
          <p>Everyone's in the same meeting, sharing the same agenda. Everyone also has a private <strong>Hidden Agenda</strong> they'll never say out loud (yours is shown in the hand panel once the meeting starts).</p>

          <h3>The Minutes</h3>
          <p>There are 5 Topics: Budget, Timeline, Personnel, Strategy, Operations. Each one moves through stages as people play cards on it: <strong>Raised &rarr; Disputed &rarr; Tabled &rarr; Approved</strong>. The table wins together if <strong>any 2 Topics reach Approved</strong> &mdash; that's the Shared Agenda.</p>

          <h3>Each round</h3>
          <p>Everyone secretly picks one card (or Passes). Then everyone reveals at once. The card with the highest effective <strong>Attack</strong> wins the floor and actually happens &mdash; everyone else got talked over, no effect, no cost. Ties go to whoever is closest to the rotating Chair (&#128081;).</p>

          <h3>Reading a card</h3>
          <ul class="help-list">
            <li>&#9889; <strong>Attack</strong> &mdash; how fast you jump in. Highest Attack wins the round.</li>
            <li>&#9203; <strong>Sustain</strong> &mdash; if you win: spends that much of the shared Duration clock, and is the strength you're bringing. To Rewrite or Remove something, your Sustain must be &ge; its current <strong>Entrenchment</strong> or the attempt bounces (no change, but the target gets 1 easier to crack next time).</li>
            <li>&#128564; <strong>Decay</strong> &mdash; winning with this card tires you out: it's subtracted from your Attack the next time you try to win with anything.</li>
          </ul>

          <h3>Legal vs illegal</h3>
          <p>A card in your hand is only playable if its Topic is untouched (to raise it) or already has an item on it (to Rewrite/Remove it). Illegal cards look faded &mdash; you can still see them, just can't play them this round.</p>

          <h3>Duration</h3>
          <p>A shared clock for the whole table. Winning plays spend it. If it runs out and nobody has a legal move left, the meeting's over &mdash; check the Shared Agenda and everyone's Hidden Agenda to see how it went.</p>
        </div>
        <button data-action="close-help">Got it, let's go</button>
      </div>
    </div>
  `;
}

function renderLanding(): string {
  return `
    <div class="screen landing">
      <div class="title-row">
        <h1>Work Meeting</h1>
        <button class="secondary help-btn" data-action="open-help">How to Play</button>
      </div>
      <p class="tagline">Everyone's in the same meeting. Everyone has a private reason for being there.</p>
      ${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}
      <form id="create-form" class="panel">
        <h2>Start a new meeting</h2>
        <label>Your name<input id="create-name" maxlength="20" required value="${esc(state.name)}" placeholder="e.g. Priya" /></label>
        <button type="submit">Create Meeting</button>
      </form>
      <form id="join-form" class="panel">
        <h2>Join a meeting</h2>
        <label>Room code<input id="join-code" maxlength="4" required placeholder="ABCD" style="text-transform:uppercase" /></label>
        <label>Your name<input id="join-name" maxlength="20" required value="${esc(state.name)}" placeholder="e.g. Devon" /></label>
        <button type="submit">Join Meeting</button>
      </form>
    </div>
  `;
}

function renderConnecting(): string {
  return `<div class="screen"><p>Joining the meeting${state.error ? `: <span class="error">${esc(state.error)}</span>` : "..."}</p></div>`;
}

function renderLobby(): string {
  const l = state.lobby!;
  const canStart = l.players.length >= 2;
  const canAddBot = l.players.length < 8;
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
      <p class="hint">2-8 people (bots welcome). Once you start, everyone secretly picks one card per round &mdash; see "How to Play" if you're new.</p>
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
    Operations: "#3fb0ac",
  };
  return topic ? map[topic] : "#888";
}

function cardIsLegalGuess(card: CardDef, g: ClientGameState): boolean {
  // Best-effort client-side legality preview; the server is authoritative and will reject illegal commits.
  if (card.verb !== "Overtime" && card.sustain > g.duration) return false;
  if (card.verb === "NewBusiness") return TOPIC_ORDER.some((t) => !g.minutes[t]);
  if (card.verb === "Overtime") return true;
  if (card.verb === "Add") return !g.minutes[card.topic!];
  if (card.verb === "Rewrite" || card.verb === "Remove") return !!g.minutes[card.topic!];
  return false;
}

function renderCard(
  card: CardDef,
  opts: { selected?: boolean; legal?: boolean; faded?: boolean; badge?: string; entrenchment?: number } = {}
): string {
  const cls = ["card"];
  if (opts.selected) cls.push("selected");
  if (opts.legal === false) cls.push("illegal");
  if (opts.faded) cls.push("faded");
  const needsEntrenchment = card.verb === "Rewrite" || card.verb === "Remove";
  return `
    <div class="${cls.join(" ")}" data-card-id="${card.id}" style="--topic-color:${topicColor(card.topic)}">
      ${opts.badge ? `<div class="card-badge">${opts.badge}</div>` : ""}
      <div class="card-topic">${card.topic ?? "Universal"}</div>
      <div class="card-name">${esc(card.name)}</div>
      <div class="card-stats">
        <span title="Attack: speed to win priority">&#9889; Atk ${card.attack}</span>
        <span title="Sustain: costs this much Duration; also the entrenchment it sets or must beat">&#9203; Sus ${card.sustain}</span>
        <span title="Decay: your own Attack penalty next time you win with this">&#128564; Dec ${card.decay}</span>
      </div>
      <div class="card-effect">${esc(card.effectText)}${
        needsEntrenchment && opts.entrenchment !== undefined
          ? ` <strong>Target's Entrenchment: ${opts.entrenchment}</strong> (${card.sustain >= opts.entrenchment ? "would succeed" : "would bounce"})`
          : ""
      }</div>
      <div class="card-flavor">${esc(card.flavorText)}</div>
    </div>
  `;
}

function renderMinutesBoard(g: ClientGameState): string {
  return `
    <div class="minutes-board">
      ${TOPIC_ORDER.map((topic) => {
        const item = g.minutes[topic];
        const isFloor = g.floor?.topic === topic;
        const creditName = item ? g.players.find((p) => p.id === item.credit)?.name ?? "?" : "";
        return `
          <div class="minutes-col ${isFloor ? "floor" : ""}" style="--topic-color:${topicColor(topic)}">
            <div class="minutes-topic">${topic}</div>
            ${
              item
                ? `<div class="minutes-status status-${item.status}">${item.status}</div>
                   <div class="minutes-credit">Credit: ${esc(creditName)}</div>
                   <div class="minutes-entrenchment">Entrenchment: ${item.entrenchment}</div>`
                : `<div class="minutes-empty">Untouched</div>`
            }
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderGame(g: ClientGameState): string {
  const you = g.you;
  const selectedCard = state.selectedCardId ? you.hand.find((c) => c.id === state.selectedCardId) : null;
  const needsTopicPick = selectedCard?.verb === "NewBusiness";
  const openTopics = TOPIC_ORDER.filter((t) => !g.minutes[t]);
  const canCommit = state.selectedCardId !== null && (!needsTopicPick || state.selectedTopic !== null);
  const youCommitted = g.committedPlayerIds.includes(you.id);

  return `
    <div class="screen game">
      <header class="game-header">
        <div class="meta">Room ${esc(g.config ? state.roomCode : state.roomCode)} &middot; Round ${g.round}</div>
        <div class="duration">Duration: <strong>${g.duration}</strong></div>
        <div class="fatigue">Fatigue: ${g.fatigue}</div>
        <button class="secondary help-btn" data-action="open-help">?</button>
      </header>

      ${renderMinutesBoard(g)}

      <section class="players-panel">
        ${g.players
          .map((p, i) => {
            const isChair = i === g.chairSeat;
            const committed = g.committedPlayerIds.includes(p.id);
            return `<div class="player-chip ${p.connected ? "" : "disconnected"} ${p.id === you.id ? "you" : ""}">
              ${isChair ? "&#128081; " : ""}${p.isBot ? "&#129302; " : ""}${esc(p.name)} &middot; ${p.handCount} cards ${p.decayPenalty ? `&middot; -${p.decayPenalty} atk` : ""}
              ${committed ? ' <span class="committed-dot">&#10003;</span>' : ""}
            </div>`;
          })
          .join("")}
      </section>

      <section class="hand-panel">
        <div class="hidden-agenda">Hidden Agenda: <strong>${hiddenAgendaLabel(you.hiddenAgenda)}</strong> <span class="hint">(private &mdash; don't say it out loud)</span></div>
        ${
          state.showHandHint && g.round <= 2 && !youCommitted
            ? `<div class="hand-hint">Full-color cards are legal to play this round; faded ones would get talked over. Pick one and hit Commit, or Pass if nothing fits. <button class="secondary" data-action="dismiss-hand-hint">Got it</button></div>`
            : ""
        }
        ${
          youCommitted
            ? `<p class="hint">Locked in. Waiting for the rest of the room...</p>`
            : `<div class="hand">
                ${you.hand
                  .map((c) =>
                    renderCard(c, {
                      selected: c.id === state.selectedCardId,
                      legal: cardIsLegalGuess(c, g),
                      entrenchment: c.topic ? g.minutes[c.topic]?.entrenchment : undefined,
                    })
                  )
                  .join("")}
               </div>
               ${
                 needsTopicPick
                   ? `<div class="topic-picker">Raise which topic? ${openTopics
                       .map((t) => `<button data-action="pick-topic" data-topic="${t}" class="${state.selectedTopic === t ? "selected" : ""}">${t}</button>`)
                       .join("")}</div>`
                   : ""
               }
               <div class="hand-actions">
                 <button data-action="commit" ${canCommit ? "" : "disabled"}>Commit Card</button>
                 <button data-action="pass" class="secondary">Pass</button>
               </div>`
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

function hiddenAgendaLabel(agenda: ClientGameState["you"]["hiddenAgenda"]): string {
  switch (agenda.type) {
    case "CreditOnApproved":
      return "Get Credit on any Approved item.";
    case "CreditOnTwoPlusItems":
      return "Get Credit on 2+ items, any status.";
    case "TopicNeverApproved":
      return `Keep ${agenda.targetTopic} from ever reaching Approved.`;
    case "ItemRemovedByOther":
      return "See an item you don't hold Credit on get Removed.";
  }
}

function renderRevealOverlay(reveal: RoundReveal): string {
  const sorted = [...reveal.plays].sort((a, b) => (b.isWinner ? 1 : 0) - (a.isWinner ? 1 : 0) || b.effAttack - a.effAttack);
  return `
    <div class="reveal-overlay">
      <div class="reveal-box">
        <div class="reveal-round">Round ${reveal.round}</div>
        <div class="reveal-plays">
          ${sorted
            .map(
              (p) => `
            <div class="reveal-play ${p.isWinner ? (p.success ? "winner" : "bounced") : "fizzled"}">
              <div class="reveal-name">${esc(p.playerName)}</div>
              <div class="reveal-card">${esc(p.cardName)}</div>
              <div class="reveal-attack">Atk ${p.effAttack}${!p.legal ? " (illegal)" : ""}</div>
              <div class="reveal-tag">${p.isWinner ? (p.success ? "WON THE FLOOR" : "BOUNCED") : "TALKED OVER"}</div>
            </div>
          `
            )
            .join("")}
          ${reveal.passed.map((name) => `<div class="reveal-play passed"><div class="reveal-name">${esc(name)}</div><div class="reveal-tag">PASSED</div></div>`).join("")}
        </div>
        <div class="reveal-outcome">${esc(reveal.outcomeText)}</div>
      </div>
    </div>
  `;
}

function renderEnd(g: ClientGameState): string {
  const summary = g.endSummary!;
  return `
    <div class="screen end">
      <h1>${summary.sharedAgendaSuccess ? "MEETING ADJOURNED" : "The Meeting Ran Long"}</h1>
      <p class="verdict">
        ${
          summary.sharedAgendaSuccess
            ? `The Shared Agenda was met &mdash; ${summary.approvedCount} items reached Approved.`
            : `Only ${summary.approvedCount} item(s) reached Approved. We'll pick this up next time.`
        }
      </p>
      <p class="hint">Lasted ${summary.rounds} rounds. Ended: ${summary.reason.replace(/-/g, " ")}.</p>

      ${renderMinutesBoard(g)}

      <h2>Hidden Agendas Revealed</h2>
      <ul class="agenda-reveal">
        ${summary.players
          .map(
            (p) => `<li class="${p.hiddenAgendaSuccess ? "success" : "fail"}">
              <strong>${esc(p.name)}</strong>: ${hiddenAgendaLabel(p.hiddenAgenda as any)} &mdash; ${p.hiddenAgendaSuccess ? "Achieved" : "Did not achieve"}
            </li>`
          )
          .join("")}
      </ul>

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
    el.addEventListener("click", () => {
      const action = el.dataset.action;
      if (action === "copy-code" && state.lobby) {
        navigator.clipboard?.writeText(state.lobby.roomCode).catch(() => {});
      } else if (action === "start") {
        state.conn?.send({ type: "start" });
      } else if (action === "commit") {
        if (!state.selectedCardId) return;
        state.conn?.send({ type: "commit", cardId: state.selectedCardId, targetTopic: state.selectedTopic ?? undefined });
        state.selectedCardId = null;
        state.selectedTopic = null;
      } else if (action === "pass") {
        state.conn?.send({ type: "commit", cardId: null });
      } else if (action === "restart") {
        state.conn?.send({ type: "restart" });
      } else if (action === "add-bot") {
        state.conn?.send({ type: "add-bot" });
      } else if (action === "remove-bot") {
        const playerId = el.dataset.playerId!;
        state.conn?.send({ type: "remove-bot", playerId });
      } else if (action === "pick-topic") {
        state.selectedTopic = el.dataset.topic as Topic;
        render();
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
      }
    });
  });

  app.querySelectorAll<HTMLElement>(".hand .card").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.cardId!;
      state.selectedCardId = state.selectedCardId === id ? null : id;
      state.selectedTopic = null;
      render();
    });
  });
}

render();
