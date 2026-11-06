import { DiscordSDK } from '@discord/embedded-app-sdk'

// Figures out who we are and how to reach the table server.
//  - inside Discord (URL has ?frame_id=...): Discord login via the Embedded App SDK
//  - plain browser: "test mode" as a guest; ?room=name picks the table (default "table")
// Memoised so React StrictMode's double-effect doesn't start the SDK twice.
let promise = null
export const initSession = () => (promise ??= start())

async function start() {
  const params = new URLSearchParams(location.search)

  if (!params.has('frame_id')) {
    let guestId = sessionStorage.getItem('guestId')
    if (!guestId) { guestId = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('guestId', guestId) }
    const room = (params.get('room') || 'table').replace(/[^\w-]/g, '').slice(0, 40) || 'table'
    return {
      mode: 'standalone', roomName: room, roomId: `guest-${room}`,
      wsUrl: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
      guestId, name: `Guest ${guestId.slice(0, 3).toUpperCase()}`,
    }
  }

  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID
  if (!clientId) throw new Error('VITE_DISCORD_CLIENT_ID is not set. Add it to .env and rebuild.')
  const sdk = new DiscordSDK(clientId)
  await sdk.ready()

  const { code } = await sdk.commands.authorize({
    client_id: clientId, response_type: 'code', state: '', prompt: 'none', scope: ['identify'],
  })
  const res = await fetch('/.proxy/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) throw new Error(body.error || 'Discord login failed (token exchange). Check DISCORD_CLIENT_SECRET on the server.')
  const auth = await sdk.commands.authenticate({ access_token: body.access_token })
  if (!auth) throw new Error('Discord authentication failed.')

  return {
    mode: 'discord', roomName: 'Discord', roomId: sdk.instanceId,
    wsUrl: `wss://${location.host}/.proxy/ws`,       // Discord's proxy forwards /.proxy/* to your URL mapping
    accessToken: body.access_token,
    name: auth.user.global_name || auth.user.username,
  }
}
