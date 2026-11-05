import 'dotenv/config'
import express from 'express'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { RoomManager } from './rooms.js'

const PORT = process.env.PORT || 3001
const CLIENT_ID = process.env.VITE_DISCORD_CLIENT_ID
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const app = express()
app.use(express.json({ limit: '4kb' }))

// Discord OAuth2: exchange the Activity's authorization code for an access token.
app.post('/api/token', async (req, res) => {
  const code = req.body?.code
  if (typeof code !== 'string' || !code) return res.status(400).json({ error: 'missing code' })
  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({ error: 'server is missing VITE_DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET' })
  try {
    const r = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(400).json({ error: data.error_description || data.error || 'token exchange failed' })
    res.json({ access_token: data.access_token })
  } catch {
    res.status(500).json({ error: 'token exchange failed' })
  }
})

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 })
const rooms = new RoomManager()
const cleanName = (s, fallback) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 32) : '') || fallback

// Who is this? Discord users are verified against Discord; guests are only allowed in "guest-*" test rooms.
async function authenticate(msg) {
  const roomId = typeof msg.room === 'string' ? msg.room.slice(0, 120) : ''
  if (!roomId) return null
  if (typeof msg.accessToken === 'string' && msg.accessToken) {
    const r = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${msg.accessToken}` } })
    if (!r.ok) return null
    const u = await r.json()
    return { roomId, user: { id: String(u.id), name: cleanName(u.global_name || u.username, 'Player') } }
  }
  if (roomId.startsWith('guest-') && /^[A-Za-z0-9_-]{4,40}$/.test(msg.guestId || '')) {
    return { roomId, user: { id: `guest:${msg.guestId}`, name: cleanName(msg.name, 'Guest') } }
  }
  return null
}

wss.on('connection', (ws) => {
  ws.isAlive = true
  ws.on('pong', () => { ws.isAlive = true })
  let client = null, roomId = null, pending = false, budget = 30
  const refill = setInterval(() => { budget = 30 }, 1000)

  ws.on('message', async (raw) => {
    if (--budget < 0) return                       // crude flood protection
    let msg
    try { msg = JSON.parse(raw) } catch { return }
    if (!client) {
      if (msg.type !== 'hello' || pending) return
      pending = true
      try {
        const auth = await authenticate(msg)
        if (!auth) return ws.close(1008, 'auth failed')
        roomId = auth.roomId
        client = { user: auth.user, send: (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)) } }
        client.send({ type: 'welcome', userId: client.user.id })
        rooms.join(roomId, client)
      } catch { ws.close(1011, 'error') }
      return
    }
    rooms.handle(roomId, client, msg)
  })
  ws.on('close', () => { clearInterval(refill); if (client) rooms.leave(roomId, client) })
})

setInterval(() => {                                // drop dead connections
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue } ws.isAlive = false; ws.ping() }
}, 30000).unref()

server.listen(PORT, () => console.log(`Realm of Ashenmere server on http://localhost:${PORT}${fs.existsSync(DIST) ? '' : '  (no dist/ yet – run "npm run build" or use "npm run dev")'}`))
