import { FC, F, ZONES } from './config.js'
import { cl } from './noise.js'

export function createFog(WP, hash) {
  const FN = WP / FC
  const fb = new Float32Array(FN * FN)  // base alpha
  const fz = new Uint8Array(FN * FN)    // zone index
  const fd = new Float32Array(FN * FN)  // reveal delay
  const fc = new Uint8Array(FN * FN)    // colour variant
  for (let y = 0; y < FN; y++) for (let x = 0; x < FN; x++) {
    const d = [y, FN - 1 - x, FN - 1 - y, x], m = Math.min(...d), i = y * FN + x
    fz[i] = d.indexOf(m)
    fc[i] = hash(x, y) > .88 ? 1 : 0
    if (m < F) {
      fb[i] = Math.round(cl((F - m) / 9 + (hash(x + 99, y) - .5) * .3, 0, 1) * 5) / 5
      fd[i] = (F - m) * 26
    }
  }
  const rev = { north: null, east: null, south: null, west: null }
  const reveal = (z) => {
    if (z === 'all') { ZONES.forEach((zz) => reveal(zz)); return }
    if (rev[z] === null) rev[z] = performance.now()
  }
  const refog = (z) => {
    if (z === 'all') { ZONES.forEach((zz) => refog(zz)); return }
    rev[z] = null
  }
  return { FN, fb, fz, fd, fc, rev, reveal, refog }
}
