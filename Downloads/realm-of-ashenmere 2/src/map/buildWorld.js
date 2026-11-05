import { T } from './config.js'
import { rng, mk, createHash, cl } from './noise.js'
import { makeSprites } from './sprites.js'

const PREFIX = ['Oak', 'Ash', 'Brin', 'Mar', 'Raven', 'Stone', 'Iron', 'Wolf', 'Elder', 'Thorn', 'Frost', 'Gloom', 'Black', 'Silver', 'Amber', 'Crow', 'Mist', 'Dun', 'Wyr', 'Hazel', 'Cinder', 'Grey', 'Willow', 'Ember']
const VILLAGE_SUFFIX = ['hollow', 'wick', 'fen', 'ford', 'brook', 'stead', 'haven', 'mere', 'combe', 'wood', 'dale', 'bury']
const REALM_SUFFIX = ['mere', 'mark', 'reach', 'vale', 'moor', 'fall', 'gard', 'land', 'shire']
const TOWER_NAMES = ['Aldric', 'Morwen', 'Veyra', 'Orlan', 'Kestrel', 'Thessaly', 'Dorian', 'Isolde', 'Caedmon', 'Elowen']
const CAMPS = ['Smugglers Camp', 'Bandit Camp', 'Outlaw Camp', 'Ranger Camp', "Raiders' Camp", 'Poachers Camp']
const RUINS = ['The Old Ruins', 'The Fallen Hold', 'The Sunken Keep', 'The Broken Spire', 'The Hollow Abbey', 'The Forgotten Fort']

const SEA = .445
let cache = null   // last map only (also makes React StrictMode's double mount free)

// Generates a whole realm on an offscreen canvas. Deterministic for (seed, tiles).
export function buildWorld(seed, tiles) {
  if (cache && cache.seed === seed && cache.tiles === tiles) return cache

  const WP = tiles * T
  const r = rng(seed), tr = rng(seed + 9)
  const n1 = mk(r), n2 = mk(r), n3 = mk(r), hash = createHash(seed)
  const uni = (a, b) => a + (b - a) * tr()
  const one = (a) => a[tr() * a.length | 0]
  const landBias = uni(.03, .09), forestThr = uni(.5, .62)   // per-map variety

  const world = document.createElement('canvas')
  world.width = world.height = WP
  const wx = world.getContext('2d')
  const { rect, tree, pine, boulder, house, tower, castle, camp, ruins } = makeSprites(wx)
  const pois = []

  // ---- height map
  const hm = new Float32Array(WP * WP)
  for (let y = 0; y < WP; y++) for (let x = 0; x < WP; x++) {
    let h = .5 * n1(x / 380, y / 380) + .3 * n1(x / 150 + 20, y / 150 + 20) + .15 * n1(x / 50 + 50, y / 50 + 50) + .05 * n3(x / 16, y / 16)
    h = (h - .5) * 2.2 + .5
    h += landBias * cl((.62 - h) * 10, 0, 1)                                   // more land, mountains untouched
    if (h > .6) h += (h - .6) * .35 * (1 - Math.abs(2 * n2(x / 45, y / 45) - 1))   // ridged mountains
    const e = Math.min(x, y, WP - 1 - x, WP - 1 - y) / (WP * .2)
    if (e < 1) h -= .3 * (1 - e) * (1 - e)                                     // sea toward the edges
    hm[y * WP + x] = h
  }

  // ---- terrain colouring
  const C = (a) => 0xFF000000 | a[2] << 16 | a[1] << 8 | a[0], P = (a) => a.map(C)
  const DEEP = P([[22, 52, 94], [26, 62, 110]]), MID = P([[36, 90, 154], [44, 104, 171], [56, 118, 184]]), SHAL = P([[76, 143, 192], [94, 160, 205]])
  const WAVE = C([120, 180, 220]), FOAM = C([205, 230, 245]), FOAM2 = C([240, 250, 255])
  const WET = P([[168, 148, 98], [182, 162, 110]]), SAND = P([[201, 179, 120], [216, 196, 138], [228, 211, 157]])
  const GRASS = P([[48, 98, 42], [60, 118, 48], [74, 138, 56], [90, 156, 66]]), FOREST = P([[34, 76, 36], [44, 92, 42], [56, 108, 50]]), TUFT = C([130, 190, 90])
  const HILL = P([[100, 102, 64], [112, 120, 70], [128, 126, 82], [146, 138, 96]])
  const ROCK = P([[70, 70, 82], [88, 88, 100], [108, 108, 120], [132, 132, 144], [152, 152, 164]])
  const SNOW = P([[190, 202, 222], [222, 232, 244], [246, 250, 253]])
  const pk = (p, v) => p[cl(Math.floor(v * p.length), 0, p.length - 1)]
  const img = wx.createImageData(WP, WP), buf = new Uint32Array(img.data.buffer)
  for (let y = 0; y < WP; y++) for (let x = 0; x < WP; x++) {
    const i = y * WP + x, hv = hm[i], d = hash(x, y)
    const sl = hm[x > 0 ? i - 1 : i] - hm[x < WP - 1 ? i + 1 : i] + hm[y > 0 ? i - WP : i] - hm[y < WP - 1 ? i + WP : i]   // NW light
    const sh = cl(Math.round(sl * 110), -2, 2), q = hv + (d - .5) * .016, mo = n3(x / 9, y / 9)
    let c
    if (q < SEA) {
      c = pk(q < .30 ? DEEP : q < .40 ? MID : SHAL, mo * .6 + d * .4)
      if ((y + (n3(x / 25, y / 25) * 8 | 0)) % 9 === 0 && hash(x >> 1, y) > .5) c = WAVE
      if (q > .432 && d > .5) c = FOAM
      if (q > .44) c = FOAM2
    } else if (q < .475) c = pk(q < .455 ? WET : SAND, mo * .6 + d * .4)
    else if (q < .64) {
      const fo = n2(x / 120 + 5, y / 120 + 5) > forestThr
      c = pk(fo ? FOREST : GRASS, cl(mo * .6 + d * .3 + sh * .06 + .05, 0, .99))
      if (d > .99) c = TUFT
    }
    else if (q < .74) c = pk(HILL, mo * .6 + d * .3 + (sh + 2) * .05)
    else if (q < .84) c = pk(ROCK, cl((sh + 2) / 4 * .8 + d * .2, 0, .99))
    else c = pk(SNOW, sh < 0 ? .1 : sh > 0 ? .9 : .5)
    buf[i] = c
  }
  wx.putImageData(img, 0, 0)

  const mask = new Uint8Array(WP * WP)
  const stamp = (x, y, rad) => { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const px = x + dx | 0, py = y + dy | 0; if (dx * dx + dy * dy <= rad * rad && px >= 0 && py >= 0 && px < WP && py < WP) mask[py * WP + px] = 1 } }

  // ---- points of interest (random, on land, names generated)
  const findLand = (tx, ty) => {
    for (let rad = 0; rad < 500; rad += 8) for (let k = 0; k < 14; k++) {
      const a = k / 14 * 6.283, x = tx + Math.cos(a) * rad | 0, y = ty + Math.sin(a) * rad | 0
      if (x >= 60 && x < WP - 60 && y >= 60 && y < WP - 60) { const hv = hm[y * WP + x]; if (hv > .5 && hv < .6) return { x, y } }
    }
    return { x: tx | 0, y: ty | 0 }
  }
  const used = new Set()
  const villageName = () => { let nm; for (let k = 0; k < 50; k++) { nm = one(PREFIX) + one(VILLAGE_SUFFIX); if (!used.has(nm)) break } used.add(nm); return nm }
  const realm = one(PREFIX) + one(REALM_SUFFIX)
  const c0 = findLand(WP * .5 + uni(-.06, .06) * WP, WP * .5 + uni(-.06, .06) * WP)
  pois.push({ k: 'castle', n: 'Castle ' + realm, ...c0 })

  const kinds = ['village', 'village', 'village', 'tower', 'camp', 'ruins']
  for (let i = kinds.length - 1; i > 0; i--) { const j = tr() * (i + 1) | 0;[kinds[i], kinds[j]] = [kinds[j], kinds[i]] }
  const baseAng = uni(0, Math.PI * 2)
  kinds.forEach((k, i) => {
    let pos
    for (let at = 0; at < 12; at++) {
      const ang = baseAng + i * Math.PI * 2 / 6 + uni(-.35, .35), rad = WP * uni(.18, .31)
      pos = findLand(WP * .5 + Math.cos(ang) * rad, WP * .5 + Math.sin(ang) * rad)
      if (pois.every((o) => Math.hypot(pos.x - o.x, pos.y - o.y) > 110)) break
    }
    const n = { village: villageName, tower: () => 'Spire of ' + one(TOWER_NAMES), camp: () => one(CAMPS), ruins: () => one(RUINS) }[k]()
    pois.push({ k, n, ...pos })
  })

  // ---- roads (planks where they cross water)
  const road = (a, b) => {
    const m = { x: (a.x + b.x) / 2 + (tr() - .5) * 80, y: (a.y + b.y) / 2 + (tr() - .5) * 80 }, pts = []
    for (const [p, q] of [[a, m], [m, b]]) { const n = Math.hypot(q.x - p.x, q.y - p.y); for (let s = 0; s <= n; s += 2) pts.push([p.x + (q.x - p.x) * s / n + Math.sin(s / 9) * 2, p.y + (q.y - p.y) * s / n + Math.cos(s / 11) * 2]) }
    for (const [w, rad] of [[0, 3.6], [1, 2.5]]) for (const [x, y] of pts) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      if (dx * dx + dy * dy > rad * rad) continue
      const px = cl((x + dx) | 0, 0, WP - 1), py = cl((y + dy) | 0, 0, WP - 1), wat = hm[py * WP + px] < SEA
      rect(px, py, 1, 1, wat ? (w ? (((px + py) >> 2) & 1 ? '#8a6a3c' : '#7a5a30') : '#3a2614') : (w ? (hash(px, py) > .8 ? '#b0966a' : '#a08560') : '#7c623e'))
    }
    for (const [x, y] of pts) stamp(x | 0, y | 0, 6)
  }
  const castleP = pois[0], villages = pois.filter((p) => p.k === 'village')
  villages.forEach((v) => road(castleP, v))
  pois.forEach((p) => {
    if (p.k === 'ruins') road(castleP, p)
    else if (p.k === 'tower' || p.k === 'camp') road(villages.reduce((a, b) => Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? a : b), p)
  })
  pois.forEach((p) => stamp(p.x, p.y, p.k === 'castle' ? 46 : 30))

  // ---- trees, boulders, flowers
  const trees = []
  for (let gy = 8; gy < WP - 8; gy += 13) for (let gx = 8; gx < WP - 8; gx += 13) {
    const x = gx + (tr() * 11 | 0), y = gy + (tr() * 11 | 0), i = y * WP + x, hv = hm[i]
    if (hv < .485 || hv > .70 || mask[i]) continue
    const fo = n2(x / 120 + 5, y / 120 + 5), p = fo > forestThr ? .9 : .08 + .25 * n3(x / 30, y / 30)
    if (tr() < p) trees.push([x, y, hv > .6 || (fo > forestThr && tr() < .35)])
  }
  for (let gy = 12; gy < WP - 12; gy += 24) for (let gx = 12; gx < WP - 12; gx += 24) {
    const x = gx + (tr() * 20 | 0), y = gy + (tr() * 20 | 0), hv = hm[y * WP + x]
    if (hv > .6 && hv < .8 && !mask[y * WP + x] && tr() < .25) trees.push([x, y, 2])
  }
  const nFlowers = Math.round(1000 * (WP / 1536) ** 2)
  for (let k = 0; k < nFlowers; k++) {
    const x = tr() * WP | 0, y = tr() * WP | 0, hv = hm[y * WP + x]
    if (hv > .5 && hv < .62 && !mask[y * WP + x]) { rect(x, y, 1, 1, ['#f4d35e', '#ee6c4d', '#ffffff', '#c77dff'][k & 3]); rect(x, y + 1, 1, 1, '#2f6b2d') }
  }

  // ---- sprites, y-sorted
  const items = trees.map((t) => ({ y: t[1], f: () => t[2] === 2 ? boulder(t[0], t[1]) : t[2] ? pine(t[0], t[1]) : tree(t[0], t[1]) }))
    .concat(pois.map((p) => ({ y: p.y, f: () => ({
      castle: () => castle(p.x, p.y),
      village: () => { house(p.x - 24, p.y - 6, ['#a8452f', '#bf5a3f']); house(p.x + 4, p.y - 10, ['#3b5a9a', '#4a6fb5']); house(p.x - 8, p.y + 10, ['#a8452f', '#bf5a3f']) },
      tower: () => tower(p.x, p.y, 44), camp: () => camp(p.x, p.y), ruins: () => ruins(p.x, p.y),
    })[p.k]() })))
  items.sort((a, b) => a.y - b.y).forEach((o) => o.f())

  cache = { seed, tiles, size: WP, canvas: world, pois, title: 'Realm of ' + realm, hash }
  return cache
}
