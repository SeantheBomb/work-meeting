import { MeetingRoom } from "./MeetingRoom";

export { MeetingRoom };

export interface Env {
  MEETING_ROOM: DurableObjectNamespace<MeetingRoom>;
  DB: D1Database;
  ASSETS: Fetcher;
}

const ROOM_CODE_RE = /^\/ws\/([A-Za-z0-9]{3,10})$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(ROOM_CODE_RE);
    if (match) {
      const roomCode = match[1].toUpperCase();
      const id = env.MEETING_ROOM.idFromName(roomCode);
      const stub = env.MEETING_ROOM.get(id);
      const forwardUrl = new URL(request.url);
      forwardUrl.searchParams.set("room", roomCode);
      return stub.fetch(new Request(forwardUrl.toString(), request));
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
