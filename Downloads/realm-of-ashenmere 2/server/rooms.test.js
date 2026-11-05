import assert from 'node:assert/strict'
import { RoomManager } from './rooms.js'

const mk = (id, name = id) => { const c = { user: { id, name }, inbox: [], send(o) { this.inbox.push(o) } }; return c }
const last = (c) => c.inbox.at(-1)

const rm = new RoomManager({ emptyTtlMs: 5 })
const A = mk('a', 'Alice'), B = mk('b', 'Bob'), C = mk('c', 'Cleo')

rm.join('r1', A); rm.join('r1', B)
assert.equal(last(B).state.dmId, 'a', 'first joiner is DM')
assert.equal(last(B).players.length, 2)

const v0 = last(A).state.mapVersion
rm.handle('r1', B, { type: 'generate', seed: 42, tiles: 96 })
assert.equal(last(A).state.mapVersion, v0, 'player cannot generate by default')
rm.handle('r1', B, { type: 'reveal', zone: 'north' })
assert.equal(last(A).state.revealed.north, false, 'player cannot reveal fog')
rm.handle('r1', B, { type: 'setEdit', value: true })
assert.equal(last(A).state.playersCanEdit, false, 'only DM can grant edit')

rm.handle('r1', A, { type: 'reveal', zone: 'north' })
assert.equal(last(B).state.revealed.north, true)
rm.handle('r1', A, { type: 'generate', seed: 42, tiles: 64 })
assert.equal(last(B).state.seed, 42); assert.equal(last(B).state.tiles, 64)
assert.equal(last(B).state.revealed.north, false, 'new map resets fog')
rm.handle('r1', A, { type: 'generate', seed: -5, tiles: 64 })
rm.handle('r1', A, { type: 'generate', seed: 7, tiles: 999 })
assert.equal(last(B).state.seed, 42, 'invalid generate ignored')
rm.handle('r1', A, { type: 'reveal', zone: 'bogus' })

rm.handle('r1', A, { type: 'setEdit', value: true })
rm.handle('r1', B, { type: 'reveal', zone: 'all' })
assert.ok(Object.values(last(A).state.revealed).every(Boolean), 'player can edit once allowed')
rm.handle('r1', B, { type: 'refog', zone: 'all' })
assert.ok(Object.values(last(A).state.revealed).every((v) => !v))

rm.join('r2', C)
assert.equal(last(C).state.dmId, 'c', 'rooms are independent')
assert.notEqual(last(C).state.mapVersion, undefined)

rm.leave('r1', A)
assert.equal(last(B).state.dmId, 'b', 'DM passes to remaining player')
assert.equal(last(B).players.length, 1)

// same user, two tabs: shows once, keeps DM when one tab closes
const B2 = mk('b', 'Bob'); rm.join('r1', B2)
assert.equal(last(B).players.length, 1)
rm.leave('r1', B); assert.equal(last(B2).state.dmId, 'b')

rm.leave('r1', B2)
const D = mk('d'); rm.join('r1', D)
assert.equal(last(D).state.dmId, 'd', 'empty room -> next arrival is DM')
await new Promise((r) => setTimeout(r, 20))
console.log('rooms.test.js: all assertions passed')
process.exit(0)
