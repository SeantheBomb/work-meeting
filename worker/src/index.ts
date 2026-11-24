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
    if (url.pathname === "/api/stats") {
      // Live "who's playing right now" tracker for the landing page. Rooms heartbeat
      // their human-player count into active_rooms (see MeetingRoom.touchPresence);
      // anything not updated recently is a dead room and doesn't count.
      try {
        const row = await env.DB.prepare(
          "SELECT COUNT(*) AS rooms, COALESCE(SUM(player_count), 0) AS players FROM active_rooms WHERE updated_at > datetime('now', '-10 minutes')"
        ).first<{ rooms: number; players: number }>();
        return Response.json({ rooms: row?.rooms ?? 0, players: row?.players ?? 0 });
      } catch {
        return Response.json({ rooms: 0, players: 0 });
      }
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
