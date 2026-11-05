import { useEffect, useState } from 'react'
import MapCanvas from './components/MapCanvas.jsx'
import Sidebar from './components/Sidebar.jsx'
import Compass from './components/Compass.jsx'
import ZoomControls from './components/ZoomControls.jsx'
import { SIZES, ZONES, DEFAULT_ZOOM } from './map/config.js'
import { seedFromText } from './map/noise.js'
import { initSession } from './net/session.js'
import { useRoom } from './net/useRoom.js'

export default function App() {
  const [boot, setBoot] = useState({ stage: 'init' })      // init | ready | error
  const [engine, setEngine] = useState(null)
  const [info, setInfo] = useState(null)                   // { title, seed, pois } of the map on screen
  const [mapLoading, setMapLoading] = useState(true)
  const [seedText, setSeedText] = useState('')
  const [size, setSize] = useState('Medium')
  const [grid, setGrid] = useState(true)
  const [fog, setFog] = useState(true)
  const [labels, setLabels] = useState(true)
  const [zoomPct, setZoomPct] = useState(100)
  const [menuOpen, setMenuOpen] = useState(() => window.innerWidth > 700)

  useEffect(() => {
    let live = true
    initSession()
      .then((session) => live && setBoot({ stage: 'ready', session }))
      .catch((e) => live && setBoot({ stage: 'error', message: e?.message || String(e) }))
    return () => { live = false }
  }, [])

  const session = boot.session
  const room = useRoom(session)
  const st = room.state

  // the table's map -> our canvas (everyone gets the same seed, so everyone builds the same map)
  const mapKey = st ? `${st.seed}:${st.tiles}:${st.mapVersion}` : null
  useEffect(() => {
    if (!engine || !st) return undefined
    let live = true
    setMapLoading(true)
    engine.generate(st.seed, st.tiles).then((res) => {
      if (!res || !live) return
      setInfo(res)
      document.title = `${res.title} – Realm of Ashenmere`
      setMapLoading(false)
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, mapKey])

  // the table's fog -> our canvas
  const revKey = st ? ZONES.map((z) => (st.revealed[z] ? 1 : 0)).join('') : ''
  useEffect(() => { if (engine && st) engine.setRevealed(st.revealed) }, [engine, revKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // local display options (players always see fog; fog is the DM's tool)
  useEffect(() => { engine?.setOptions({ grid, labels, fog: room.isDm ? fog : true }) }, [engine, grid, labels, fog, room.isDm])

  // zoom readout (100% = default zoom)
  useEffect(() => {
    if (!engine) return undefined
    engine.onZoom = (z) => setZoomPct(Math.round(z / DEFAULT_ZOOM * 100))
    return () => { engine.onZoom = null }
  }, [engine])

  // fog-zone conditions (src/map/conditions.js) and window.mapAPI act on the shared table, DM only
  const { isDm, reveal, refog } = room
  useEffect(() => {
    if (!engine) return undefined
    engine.onConditionReveal = (z) => { if (isDm) reveal(z) }
    window.mapAPI = { reveal: (z) => reveal(z), refog: (z) => refog(z) }
    return () => { engine.onConditionReveal = null; delete window.mapAPI }
  }, [engine, isDm, reveal, refog])

  if (boot.stage === 'error') {
    return (
      <div className="splash">
        <h1>Realm of Ashenmere</h1>
        <p>{boot.message}</p>
      </div>
    )
  }

  let overlay = null
  if (boot.stage === 'init') overlay = 'Connecting…'
  else if (!st) overlay = room.status === 'reconnecting' ? 'Can’t reach the table server… retrying' : 'Joining the table…'
  else if (mapLoading) overlay = 'Forging the realm…'

  return (
    <div className="app">
      {menuOpen && (
        <Sidebar
          mode={session?.mode} roomName={session?.roomName}
          info={info} room={room} mapBusy={mapLoading}
          seedText={seedText} setSeedText={setSeedText} size={size} setSize={setSize}
          grid={grid} setGrid={setGrid} fog={fog} setFog={setFog} labels={labels} setLabels={setLabels}
          onGenerate={() => room.generate(seedFromText(seedText), SIZES[size])}
          onAllowEdit={room.setPlayersCanEdit}
          onReveal={room.reveal} onRefog={() => room.refog('all')}
          onFocus={(p) => engine?.focus(p)} onSave={() => engine?.exportPNG()}
          onClose={() => setMenuOpen(false)}
        />
      )}
      <div className="pane">
        <MapCanvas onEngine={setEngine} />
        {!menuOpen && <button className="menu-btn" onClick={() => setMenuOpen(true)}>☰ Menu</button>}
        {st && room.status === 'reconnecting' && <div className="banner">Reconnecting…</div>}
        <Compass />
        <ZoomControls pct={zoomPct} onIn={() => engine?.zoomBy(1.25)} onOut={() => engine?.zoomBy(1 / 1.25)} onReset={() => engine?.resetZoom()} onFit={() => engine?.fit()} />
        {overlay && <div className="loading">{overlay}</div>}
      </div>
    </div>
  )
}
