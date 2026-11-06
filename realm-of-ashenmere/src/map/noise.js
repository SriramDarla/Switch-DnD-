export function rng(s) {
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0
    let t = Math.imul(s ^ s >>> 15, 1 | s)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export function mk(r, n = 128) {
  const g = Array.from({ length: n * n }, () => r())
  const sm = (t) => t * t * (3 - 2 * t)
  const v = (a, b) => g[(((b % n) + n) % n) * n + (((a % n) + n) % n)]
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), w = sm(y - yi)
    return (v(xi, yi) * (1 - u) + v(xi + 1, yi) * u) * (1 - w) + (v(xi, yi + 1) * (1 - u) + v(xi + 1, yi + 1) * u) * w
  }
}

export const createHash = (seed) => (x, y) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) ^ seed
  h = Math.imul(h ^ h >>> 13, 1274126177)
  return ((h ^ h >>> 16) >>> 0) / 4294967296
}

export const cl = (v, a, b) => Math.max(a, Math.min(b, v))

// '' -> random; digits -> that number; anything else -> hashed text
export function seedFromText(text) {
  const t = text.trim()
  if (!t) return 1 + Math.floor(Math.random() * 9999999)
  if (/^\d+$/.test(t)) return parseInt(t, 10) >>> 0
  let h = 2166136261
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619)
  return h >>> 0
}
