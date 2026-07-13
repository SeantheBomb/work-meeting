import { ClientMessage, ServerMessage } from "../../shared/protocol";

export function connect(roomCode: string, onMessage: (msg: ServerMessage) => void, onClose: () => void) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${location.host}/ws/${roomCode}`;
  const ws = new WebSocket(url);
  ws.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(ev.data) as ServerMessage;
      onMessage(msg);
    } catch {
      // ignore malformed frame
    }
  });
  ws.addEventListener("close", onClose);
  return {
    socket: ws,
    send(msg: ClientMessage) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
}
