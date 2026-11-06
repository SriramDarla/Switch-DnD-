// Pixel-art sprite painters, all drawing onto the world canvas context `wx`.
export function makeSprites(wx) {
  const rect = (x, y, w, h, c) => { wx.fillStyle = c; wx.fillRect(x | 0, y | 0, w, h) }
  const disc = (x, y, rr, c) => { wx.fillStyle = c; for (let dy = -rr; dy <= rr; dy++) { const w = Math.floor(Math.sqrt(rr * rr - dy * dy + .5)); wx.fillRect(x - w, y + dy, 2 * w + 1, 1) } }
  const shadow = (x, y, w) => rect(x - w / 2, y - 1, w, 3, 'rgba(0,0,0,.28)')

  const tree = (x, y) => { shadow(x, y, 12); rect(x - 1, y - 6, 3, 6, '#4a2f1a')
    disc(x, y - 10, 6, '#1f4a22'); disc(x, y - 10, 5, '#2f6b2d'); disc(x - 1, y - 11, 3, '#3f8a39'); rect(x - 3, y - 13, 2, 1, '#7bc25a'); rect(x + 2, y - 8, 2, 1, '#255a27') }
  const pine = (x, y) => { shadow(x, y, 10); rect(x, y - 3, 1, 3, '#4a2f1a')
    for (let k = 0; k < 3; k++) for (let rr = 0; rr < 6; rr++) { const w = rr + 1 + k, yy = y - 17 + k * 4 + rr; rect(x - w, yy, w + 1, 1, '#2d6a3a'); rect(x + 1, yy, w, 1, '#1f4d2b') } }
  const boulder = (x, y) => { shadow(x, y, 9); disc(x, y - 3, 3, '#55555f'); disc(x - 1, y - 4, 2, '#8a8a96'); rect(x - 2, y - 6, 2, 1, '#b4b4c0') }
  const house = (x, y, roof) => { shadow(x + 10, y + 9, 24); rect(x, y, 18, 10, '#d9c9a0'); rect(x + 11, y, 7, 10, '#bfae84')
    for (let rr = 0; rr < 8; rr++) { const hw = Math.round(rr * 1.4 + 3); rect(x + 9 - hw, y - 8 + rr, 2 * hw, 1, rr % 2 ? roof[0] : roof[1]) }
    rect(x + 7, y + 4, 4, 6, '#5a3a1e'); rect(x + 2, y + 3, 3, 3, '#f4d35e'); rect(x + 13, y + 3, 3, 3, '#e0b84a') }
  const tower = (x, y, h) => { shadow(x, y + 1, 22); rect(x - 7, y - h, 14, h, '#9a9aa8'); rect(x, y - h, 7, h, '#83838f')
    for (let rr = 0; rr < h; rr += 4) rect(x - 7, y - h + rr, 14, 1, 'rgba(0,0,0,.12)')
    for (let k = 0; k < 3; k++) rect(x - 7 + k * 5, y - h - 3, 4, 3, '#9a9aa8')
    for (let rr = 0; rr < 10; rr++) { const hw = rr + 1; rect(x - hw, y - h - 13 + rr, 2 * hw + 1, 1, rr % 2 ? '#3b5a9a' : '#4a6fb5') }
    rect(x - 1, y - h + 8, 3, 5, '#f4d35e') }
  const castle = (x, y) => { shadow(x, y + 1, 76)
    rect(x - 30, y - 16, 60, 16, '#8d8d99'); rect(x - 30, y - 16, 60, 2, '#a9a9b6')
    for (let i = 0; i < 10; i++) rect(x - 30 + i * 6, y - 20, 4, 4, '#8d8d99')
    rect(x - 16, y - 34, 32, 34, '#9d9dab'); rect(x, y - 34, 16, 34, '#878795')
    for (let rr = 0; rr < 34; rr += 4) rect(x - 16, y - 34 + rr, 32, 1, 'rgba(0,0,0,.12)')
    for (let i = 0; i < 6; i++) rect(x - 16 + i * 6, y - 39, 4, 5, '#9d9dab')
    rect(x - 5, y - 16, 10, 16, '#2a2420'); disc(x, y - 16, 5, '#2a2420')
    rect(x - 9, y - 28, 3, 5, '#f4d35e'); rect(x + 6, y - 28, 3, 5, '#f4d35e')
    rect(x, y - 60, 1, 22, '#3a3a3a'); rect(x + 1, y - 60, 11, 6, '#c0392b'); rect(x + 1, y - 56, 11, 1, '#8e2a1f')
    tower(x - 32, y + 2, 34); tower(x + 32, y + 2, 34) }
  const tent = (x, y, c) => { for (let rr = 0; rr < 10; rr++) rect(x - rr, y - 10 + rr, 2 * rr + 1, 1, rr % 2 ? c : '#c76a52'); rect(x - 1, y - 3, 3, 3, '#2a1a10') }
  const camp = (x, y) => { shadow(x, y + 2, 40); tent(x - 14, y, '#b5523b'); tent(x + 14, y + 2, '#7a8a4a')
    for (let k = 0; k < 6; k++) disc(x + Math.cos(k) * 4 | 0, y + 3 + Math.sin(k) * 2 | 0, 1, '#6a6a72')
    rect(x - 1, y - 2, 3, 4, '#e8742a'); rect(x, y - 4, 1, 3, '#f4d35e') }
  const ruins = (x, y) => { shadow(x, y + 2, 50); [[-14, 18], [-4, 10], [6, 24], [16, 8]].forEach(([dx, h]) => { rect(x + dx - 3, y - h, 6, h, '#9a9aa8'); rect(x + dx, y - h, 3, h, '#83838f'); rect(x + dx - 3, y - h - 2, 6, 2, '#b4b4c0') })
    rect(x - 18, y - 3, 36, 3, '#7c7c88'); boulder(x + 22, y + 2); boulder(x - 24, y + 3) }

  return { rect, disc, tree, pine, boulder, house, tower, castle, camp, ruins }
}
