import { useCallback, useEffect, useRef, useState } from 'react'

// Keeps a WebSocket to the table server and exposes the shared room state + actions.
export function useRoom(session) {
  const [status, setStatus] = useState('connecting')     // connecting | connected | reconnecting
  const [snap, setSnap] = useState(null)                 // { state, players }
  const [userId, setUserId] = useState(null)
  const wsRef = useRef(null)

  useEffect(() => {
    if (!session) return undefined
    let closed = false, retry = 0, timer
    const connect = () => {
      const ws = new WebSocket(session.wsUrl)
      wsRef.current = ws
      setStatus(retry ? 'reconnecting' : 'connecting')
      ws.onopen = () => {
        retry = 0
        ws.send(JSON.stringify({ type: 'hello', room: session.roomId, accessToken: session.accessToken, guestId: session.guestId, name: session.name }))
      }
      ws.onmessage = (e) => {
        let m
        try { m = JSON.parse(e.data) } catch { return }
        if (m.type === 'welcome') { setUserId(m.userId); setStatus('connected') }
        else if (m.type === 'state') setSnap({ state: m.state, players: m.players })
      }
      ws.onclose = () => {
        if (closed) return
        setStatus('reconnecting')
        timer = setTimeout(connect, Math.min(5000, 500 * 2 ** retry++))
      }
    }
    connect()
    return () => { closed = true; clearTimeout(timer); wsRef.current?.close() }
  }, [session])

  const send = useCallback((msg) => {
    const ws = wsRef.current
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg))
  }, [])

  const state = snap?.state ?? null
  const isDm = !!state && userId === state.dmId
  return {
    status, state, players: snap?.players ?? [], userId, isDm,
    canEdit: !!state && (isDm || state.playersCanEdit),
    generate: useCallback((seed, tiles) => send({ type: 'generate', seed, tiles }), [send]),
    reveal: useCallback((zone) => send({ type: 'reveal', zone }), [send]),
    refog: useCallback((zone) => send({ type: 'refog', zone }), [send]),
    setPlayersCanEdit: useCallback((value) => send({ type: 'setEdit', value }), [send]),
  }
}
