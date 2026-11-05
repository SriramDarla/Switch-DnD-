// Pure room/state logic (no network code) so it can be unit-tested.
// One room per Discord Activity instance. The room owns the shared map seed/size,
// which fog zones are lifted, and who the DM is.
import { randomInt } from 'node:crypto'

export const ZONES = ['north', 'east', 'south', 'west']
export const SIZES = [64, 96, 128]
const blankReveal = () => ({ north: false, east: false, south: false, west: false })

export class RoomManager {
  constructor({ emptyTtlMs = 10 * 60 * 1000 } = {}) {
    this.rooms = new Map()
    this.emptyTtlMs = emptyTtlMs
  }

  _get(id) {
    let r = this.rooms.get(id)
    if (!r) {
      r = {
        id, clients: new Set(), timer: null,
        state: { seed: randomInt(1, 10_000_000), tiles: 96, mapVersion: 1, revealed: blankReveal(), dmId: null, playersCanEdit: false },
      }
      this.rooms.set(id, r)
    }
    clearTimeout(r.timer); r.timer = null
    return r
  }

  // client = { user: {id, name}, send(obj) }
  join(roomId, client) {
    const r = this._get(roomId)
    r.clients.add(client)
    if (!r.state.dmId) r.state.dmId = client.user.id      // first one in is the DM
    this._broadcast(r)
    return r
  }

  leave(roomId, client) {
    const r = this.rooms.get(roomId)
    if (!r) return
    r.clients.delete(client)
    if (r.clients.size === 0) {
      r.state.dmId = null                                  // next person to arrive becomes DM
      r.timer = setTimeout(() => this.rooms.delete(roomId), this.emptyTtlMs)
      r.timer.unref?.()
      return
    }
    if (![...r.clients].some((c) => c.user.id === r.state.dmId)) r.state.dmId = [...r.clients][0].user.id
    this._broadcast(r)
  }

  handle(roomId, client, msg) {
    const r = this.rooms.get(roomId)
    if (!r || !msg || typeof msg !== 'object') return
    const s = r.state
    const isDm = client.user.id === s.dmId
    const canEdit = isDm || s.playersCanEdit
    switch (msg.type) {
      case 'generate': {
        if (!canEdit) return
        if (!Number.isInteger(msg.seed) || msg.seed < 1 || msg.seed > 4294967295 || !SIZES.includes(msg.tiles)) return
        s.seed = msg.seed; s.tiles = msg.tiles; s.mapVersion++; s.revealed = blankReveal()
        break
      }
      case 'reveal':
      case 'refog': {
        if (!canEdit) return
        const to = msg.type === 'reveal'
        if (msg.zone === 'all') ZONES.forEach((z) => { s.revealed[z] = to })
        else if (ZONES.includes(msg.zone)) s.revealed[msg.zone] = to
        else return
        break
      }
      case 'setEdit': {
        if (!isDm || typeof msg.value !== 'boolean') return
        s.playersCanEdit = msg.value
        break
      }
      default: return
    }
    this._broadcast(r)
  }

  snapshot(r) {
    const seen = new Map()
    for (const c of r.clients) if (!seen.has(c.user.id)) seen.set(c.user.id, { id: c.user.id, name: c.user.name })
    return { state: { ...r.state, revealed: { ...r.state.revealed } }, players: [...seen.values()] }
  }

  _broadcast(r) {
    const snap = { type: 'state', ...this.snapshot(r) }
    for (const c of r.clients) c.send(snap)
  }
}
