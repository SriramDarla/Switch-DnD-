import { T, DEFAULT_ZOOM, MAX_ZOOM, FC, ZONES } from './config.js'
import { cl } from './noise.js'
import { createFog } from './fog.js'
import { buildWorld } from './buildWorld.js'
import { conditions } from './conditions.js'

const LDY = { castle: -68, tower: -66, village: -26, camp: -22, ruins: -30 }  // label y-offsets

export class MapEngine {
  constructor(cv) {
    this.cv = cv
    this.g = cv.getContext('2d')
    this.cam = { x: 0, y: 0 }      // top-left of the view, in world px
    this.Z = DEFAULT_ZOOM          // current zoom (screen px per world px)
    this.onZoom = null             // optional callback(zoom)
    this.lastDist = 0
    this.opts = { grid: true, fog: true, labels: true }
    this.WP = 0
    this.world = null
    this.pois = []
    this.fog = null
    this.revealed = { north: false, east: false, south: false, west: false }   // shared fog state from the table
    this.onConditionReveal = null  // optional hook(zone) when a conditions.js function fires
    this.meta = { title: '', seed: 0 }
    this.pointers = new Map()
    this.last = null
    this.raf = 0
    this.destroyed = false

    this.resize = () => {
      const w = cv.clientWidth, h = cv.clientHeight
      if (w && h) { cv.width = w; cv.height = h }
      this.setZoom(this.Z)           // re-clamp to the new minimum (map must always cover the view)
    }
    this.centroid = () => {
      let x = 0, y = 0
      for (const p of this.pointers.values()) { x += p.x; y += p.y }
      const n = this.pointers.size || 1
      return { x: x / n, y: y / n }
    }
    // mouse drag, touch drag, two-finger touch pan (+ pinch zoom) via the pointers' centroid
    this.dist = () => {
      const [a, b] = [...this.pointers.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    this.onDown = (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      try { cv.setPointerCapture(e.pointerId) } catch { /* ignore */ }
      this.last = this.centroid()
      this.lastDist = this.pointers.size >= 2 ? this.dist() : 0
      cv.classList.add('drag')
    }
    this.onMove = (e) => {
      if (!this.pointers.has(e.pointerId)) return
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const c = this.centroid()
      this.cam.x -= (c.x - this.last.x) / this.Z
      this.cam.y -= (c.y - this.last.y) / this.Z
      this.last = c
      this.clampCam()
      if (this.pointers.size >= 2) {
        const d = this.dist(), r = cv.getBoundingClientRect()
        if (this.lastDist > 0 && d > 0) this.setZoom(this.Z * d / this.lastDist, c.x - r.left, c.y - r.top)
        this.lastDist = d
      }
    }
    this.onUp = (e) => {
      this.pointers.delete(e.pointerId)
      if (this.pointers.size) { this.last = this.centroid(); this.lastDist = this.pointers.size >= 2 ? this.dist() : 0 }
      else cv.classList.remove('drag')
    }
    // trackpad two-finger scroll / mouse wheel pans; pinch (ctrl+wheel) or Ctrl/Cmd+scroll zooms at the cursor
    this.onWheel = (e) => {
      e.preventDefault()
      const r = cv.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        const dy = cl(e.deltaY * (e.deltaMode === 1 ? 16 : 1), -30, 30)
        this.setZoom(this.Z * Math.exp(-dy * .01), e.clientX - r.left, e.clientY - r.top)
        return
      }
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cv.clientHeight : 1
      this.cam.x += e.deltaX * k / this.Z
      this.cam.y += e.deltaY * k / this.Z
      this.clampCam()
    }
    // Safari trackpad pinch
    this.onGestureStart = (e) => { e.preventDefault(); this.gz = this.Z }
    this.onGestureChange = (e) => {
      e.preventDefault()
      const r = cv.getBoundingClientRect()
      this.setZoom(this.gz * e.scale, e.clientX - r.left, e.clientY - r.top)
    }
    this.onDbl = (e) => { const r = cv.getBoundingClientRect(); this.setZoom(this.Z * 2, e.clientX - r.left, e.clientY - r.top) }
    this.onKey = (e) => {
      if (e.target.closest?.('input,select,textarea') || e.ctrlKey || e.metaKey) return
      if (e.key === '+' || e.key === '=') this.zoomBy(1.25)
      else if (e.key === '-' || e.key === '_') this.zoomBy(1 / 1.25)
      else if (e.key === '0') this.resetZoom()
    }

    this.ro = new ResizeObserver(this.resize)
    this.ro.observe(cv)
    cv.addEventListener('pointerdown', this.onDown)
    cv.addEventListener('pointermove', this.onMove)
    cv.addEventListener('pointerup', this.onUp)
    cv.addEventListener('pointercancel', this.onUp)
    cv.addEventListener('wheel', this.onWheel, { passive: false })
    cv.addEventListener('gesturestart', this.onGestureStart)
    cv.addEventListener('gesturechange', this.onGestureChange)
    cv.addEventListener('dblclick', this.onDbl)
    window.addEventListener('keydown', this.onKey)
    this.resize()

    this.poll = setInterval(() => {
      if (!this.fog) return
      for (const z of ZONES) {
        if (this.fog.rev[z] === null && conditions[z]()) {
          if (this.onConditionReveal) this.onConditionReveal(z); else this.fog.reveal(z)
        }
      }
    }, 300)
  }

  setOptions(o) { this.opts = { ...this.opts, ...o } }
  // apply the shared fog state; `instant` skips the lifting animation (used right after a map loads)
  setRevealed(map, instant = false) {
    this.revealed = { ...this.revealed, ...map }
    if (!this.fog) return
    for (const z of ZONES) {
      if (this.revealed[z] && this.fog.rev[z] === null) this.fog.rev[z] = instant ? -1e7 : performance.now()
      else if (!this.revealed[z]) this.fog.rev[z] = null
    }
  }
  reveal(z) { this.fog?.reveal(z) }
  refog(z) { this.fog?.refog(z) }

  clampCam() {
    if (!this.WP) return
    this.cam.x = cl(this.cam.x, 0, Math.max(0, this.WP - this.cv.width / this.Z))
    this.cam.y = cl(this.cam.y, 0, Math.max(0, this.WP - this.cv.height / this.Z))
  }

  // smallest zoom at which the map still covers the whole view
  minZoom() { return this.WP ? Math.max(this.cv.width, this.cv.height) / this.WP : 1 }

  // zoom around a screen point (defaults to the view centre)
  setZoom(z, sx = this.cv.width / 2, sy = this.cv.height / 2) {
    const old = this.Z, nz = cl(z, Math.min(this.minZoom(), MAX_ZOOM), MAX_ZOOM)
    if (this.WP) {
      const wx = this.cam.x + sx / old, wy = this.cam.y + sy / old
      this.Z = nz
      this.cam.x = wx - sx / nz
      this.cam.y = wy - sy / nz
      this.clampCam()
    } else this.Z = nz
    this.onZoom?.(this.Z)
  }
  zoomBy(f) { this.setZoom(this.Z * f) }
  resetZoom() { this.setZoom(DEFAULT_ZOOM) }
  fit() { this.setZoom(0) }

  focus(p) {
    this.cam.x = p.x - this.cv.width / this.Z / 2
    this.cam.y = p.y - this.cv.height / this.Z / 2
    this.clampCam()
  }

  // Builds a new realm. Resolves with {title, seed, pois}, or null if destroyed meanwhile.
  generate(seed, tiles) {
    return new Promise((resolve) => {
      setTimeout(() => {          // let the loading overlay paint before the heavy build
        if (this.destroyed) return resolve(null)
        const w = buildWorld(seed, tiles)
        this.world = w.canvas; this.pois = w.pois; this.WP = w.size
        this.fog = createFog(w.size, w.hash)
        this.setRevealed(this.revealed, true)
        this.meta = { title: w.title, seed }
        this.Z = DEFAULT_ZOOM
        this.resize()
        this.focus(w.pois[0])
        if (!this.raf) this.raf = requestAnimationFrame(this.frame)
        resolve({ title: w.title, seed, pois: w.pois })
      }, 30)
    })
  }

  frame = (now) => {
    if (this.destroyed) return
    if (this.world) this.draw(this.g, this.cv.width, this.cv.height, this.cam.x, this.cam.y, this.Z, now)
    this.raf = requestAnimationFrame(this.frame)
  }

  draw(g, W, H, cx, cy, Z, now) {
    const { world, pois, fog, opts } = this
    g.imageSmoothingEnabled = Z < 1        // crisp pixels when zoomed in, smooth when shrunk
    g.drawImage(world, cx, cy, W / Z, H / Z, 0, 0, W, H)

    if (opts.grid && T * Z >= 6) { // battle-map grid (hidden when too dense to read)
      const s = T * Z
      g.strokeStyle = 'rgba(30,20,10,.22)'; g.lineWidth = 1; g.beginPath()
      for (let x = -(cx * Z % s); x < W; x += s) { g.moveTo(Math.round(x) + .5, 0); g.lineTo(Math.round(x) + .5, H) }
      for (let y = -(cy * Z % s); y < H; y += s) { g.moveTo(0, Math.round(y) + .5); g.lineTo(W, Math.round(y) + .5) }
      g.stroke()
    }

    if (opts.labels) {
      g.font = 'italic 700 15px Georgia,serif'; g.textAlign = 'center'; g.lineJoin = 'round'; g.lineWidth = 4
      for (const p of pois) {
        const sx = (p.x - cx) * Z, sy = (p.y + LDY[p.k] - cy) * Z
        if (sx < -100 || sx > W + 100 || sy < -30 || sy > H + 30) continue
        g.strokeStyle = 'rgba(240,226,184,.92)'; g.strokeText(p.n, sx, sy)
        g.fillStyle = '#2b1a0e'; g.fillText(p.n, sx, sy)
      }
    }

    if (opts.fog) { // fog of war
      const { FN, fb, fz, fd, fc, rev } = fog
      const cs = FC * Z
      const x0 = Math.max(0, cx / FC | 0), y0 = Math.max(0, cy / FC | 0)
      const x1 = Math.min(FN - 1, Math.ceil((cx + W / Z) / FC)), y1 = Math.min(FN - 1, Math.ceil((cy + H / Z) / FC))
      for (let fy = y0; fy <= y1; fy++) for (let fx = x0; fx <= x1; fx++) {
        const i = fy * FN + fx; let a = fb[i]; if (!a) continue
        const t0 = rev[ZONES[fz[i]]]
        if (t0 !== null) { a *= 1 - cl((now - t0 - fd[i]) / 600, 0, 1); if (a < .02) continue }
        g.globalAlpha = a * (.93 + .07 * Math.sin(now / 800 + fx * .6 + fy * .45))
        g.fillStyle = fc[i] ? '#3a2a1c' : '#18110c'
        g.fillRect(Math.floor((fx * FC - cx) * Z), Math.floor((fy * FC - cy) * Z), cs + 1, cs + 1)
      }
      g.globalAlpha = 1
    }
  }

  exportPNG() {
    if (!this.world) return
    const Z = DEFAULT_ZOOM, W = this.WP * Z
    const c = document.createElement('canvas')
    c.width = c.height = W
    this.draw(c.getContext('2d'), W, W, 0, 0, Z, performance.now() + 5000)
    c.toBlob((b) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = `${this.meta.title.replace(/\s+/g, '-').toLowerCase()}-${this.meta.seed}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    })
  }

  destroy() {
    this.destroyed = true
    clearInterval(this.poll)
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    const { cv } = this
    cv.removeEventListener('pointerdown', this.onDown)
    cv.removeEventListener('pointermove', this.onMove)
    cv.removeEventListener('pointerup', this.onUp)
    cv.removeEventListener('pointercancel', this.onUp)
    cv.removeEventListener('wheel', this.onWheel)
    cv.removeEventListener('gesturestart', this.onGestureStart)
    cv.removeEventListener('gesturechange', this.onGestureChange)
    cv.removeEventListener('dblclick', this.onDbl)
    window.removeEventListener('keydown', this.onKey)
  }
}
