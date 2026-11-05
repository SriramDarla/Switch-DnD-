# Realm of Ashenmere – Discord Activity

A procedurally generated pixel-art fantasy battle map (1 square = 5 ft) that your whole
Discord voice channel can open together. Everyone sees the same map and the same fog of war,
and everyone pans and zooms for themselves. The first person to launch it is the **DM**:
only the DM can generate new maps and lift fog (unless they tick *Let players change the map*).
If the DM leaves, the next player is promoted.

It also runs in a normal browser tab for testing and solo use.

## How it works

```
Discord client ──(iframe)──> https://<APP_ID>.discordsays.com  ──proxy──>  your server (server/index.js)
                                  │   static React app (dist/)                  │
                                  │   POST /.proxy/api/token   (Discord login)  │  rooms.js: one room per Activity instance
                                  └── wss://…/.proxy/ws        (shared state) ──┘  seed, size, fog zones, who is DM
```

The map itself is generated in each player's browser from the shared **seed + size**, so only a
few bytes are ever synced. The server (Node, `express` + `ws`) keeps the shared state and checks
who is allowed to change it.

## Run it locally (no Discord needed)

```bash
npm install
npm run dev            # Vite on :5173 + table server on :3001
```

Open http://localhost:5173 – you're the DM. Open a second tab (or `?room=other` for another table)
to join as a player. Tests for the room logic: `npm test`.

## Put it in Discord

1. **Create the app.** In the [Discord Developer Portal](https://discord.com/developers/applications)
   click *New Application*. Copy the **Application ID** and, under *OAuth2*, the **Client Secret**.
2. **Configure `.env`** (copy `.env.example`):
   ```
   VITE_DISCORD_CLIENT_ID=<Application ID>
   DISCORD_CLIENT_SECRET=<Client Secret>
   ```
3. **OAuth2 → Redirects:** add any placeholder redirect URI (e.g. `https://127.0.0.1`). The SDK
   handles the real redirect itself, but the portal requires one to exist.
4. **Host it publicly over HTTPS.** Build and start the single Node server, which serves the
   site, the login endpoint and the WebSocket on one port:
   ```bash
   npm run build
   npm start                      # http://localhost:3001
   ```
   * *Quick test:* `cloudflared tunnel --url http://localhost:3001` prints an
     `https://something.trycloudflare.com` address (it changes every run).
   * *Permanent:* deploy to a host that runs Node **with WebSocket support** (Render, Railway,
     Fly.io, a VPS…). Static-only hosts (Vercel/Netlify static, GitHub Pages) won't work because
     the shared table needs the server. Set the two env vars there too, and run `npm run build` as the build step.
5. **Activities → URL Mappings:** add the root mapping `/` → your host name (no `https://`).
6. **Activities → Settings:** switch on *Enable Activities* (it needs the URL mapping first).
7. **Install the app** to your test server, join a voice channel and press the Activities
   (rocket) button, then pick *Realm of Ashenmere*. Turning on Developer Mode
   (User Settings → Advanced) helps when debugging.

Portal menus move around now and then; Discord's guide
(<https://docs.discord.com/developers/activities/building-an-activity>) always has the current steps.
Un-verified Activities may carry restrictions (for example on server size) until you go through
Discord's app verification – check their docs for the current limits.

## Good to know

* **Fog is visual.** Every browser builds the whole map, and the fog is drawn on top. It keeps
  honest players honest (players can't switch it off in the menu) but someone with developer
  tools could peek. Real secrecy would need the server to hold the map and send only revealed
  tiles.
* **Rooms live in server memory.** A table keeps its map and fog while anyone is connected
  and for 10 minutes afterwards; restarting the server resets everything.
* **Moving around:** two-finger scroll / wheel / drag; zoom with pinch, Ctrl/Cmd + scroll,
  double-click, `+` `−` `0`, or the zoom box.
* **Fog conditions:** `src/map/conditions.js` still works (polled by the DM's client and sent
  to the table). `window.mapAPI.reveal('north' | … | 'all')` / `refog(...)` also drive the shared fog from the DM's console.
* The standalone Python generator is still in `tools/`.

## Structure

```
server/
  index.js             express + ws: /api/token (Discord OAuth), /ws (table), serves dist/
  rooms.js             room state & permissions (pure logic)      rooms.test.js  unit tests
src/
  net/session.js       Discord SDK login (or guest in a plain browser)
  net/useRoom.js       WebSocket hook: shared state + actions
  App.jsx              ties table state to the map engine
  components/          Sidebar, MapCanvas, ZoomControls, Compass
  map/                 generator, sprites, fog, engine (pan/zoom/render)
tools/ashenmere_gen.py standalone Python generator
```
