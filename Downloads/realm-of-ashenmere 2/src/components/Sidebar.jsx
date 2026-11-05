import { SIZES, ZONES } from '../map/config.js'

const KIND = { castle: 'Castle', village: 'Village', tower: 'Tower', camp: 'Camp', ruins: 'Ruins' }

export default function Sidebar({
  mode, roomName, info, room, mapBusy,
  seedText, setSeedText, size, setSize,
  grid, setGrid, fog, setFog, labels, setLabels,
  onGenerate, onAllowEdit, onReveal, onRefog, onFocus, onSave, onClose,
}) {
  const { status, players, userId, isDm, canEdit, state } = room
  const dmName = players.find((p) => p.id === state?.dmId)?.name
  return (
    <aside className="sidebar">
      <header>
        <button className="close" onClick={onClose} title="Hide menu" aria-label="Hide menu">✕</button>
        <h1>{info?.title ?? 'Realm of Ashenmere'}</h1>
        <small>{info ? `seed ${info.seed} · 1 square = 5 ft` : '1 square = 5 ft'}</small>
      </header>

      <section>
        <h2><span className={`dot ${status}`} /> Table</h2>
        {mode === 'standalone' && (
          <small>Test mode (not inside Discord), room “{roomName}”. Open this page in another tab to join as another player.</small>
        )}
        <ul className="players">
          {players.map((p) => (
            <li key={p.id}>
              {p.name}{p.id === state?.dmId && <em> · DM</em>}{p.id === userId && <small> (you)</small>}
            </li>
          ))}
        </ul>
        {isDm && (
          <label className="check">
            <input type="checkbox" checked={!!state?.playersCanEdit} onChange={(e) => onAllowEdit(e.target.checked)} />
            Let players change the map
          </label>
        )}
      </section>

      {canEdit ? (
        <section>
          <button className="primary" onClick={onGenerate} disabled={mapBusy}>
            {mapBusy ? 'Forging…' : 'Generate New Map'}
          </button>
          <label className="field">Seed <span>(blank = random)</span>
            <input
              value={seedText} placeholder="e.g. 42 or dragons"
              onChange={(e) => setSeedText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !mapBusy && onGenerate()}
            />
          </label>
          <label className="field">Size
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              {Object.keys(SIZES).map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
        </section>
      ) : (
        <section><small>Only the DM{dmName ? ` (${dmName})` : ''} can generate maps or lift fog.</small></section>
      )}

      <section>
        <h2>Display</h2>
        <label className="check"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Grid</label>
        <label className="check"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Labels</label>
        {isDm && <label className="check"><input type="checkbox" checked={fog} onChange={(e) => setFog(e.target.checked)} /> Fog of war</label>}
      </section>

      {canEdit && (
        <section>
          <h2>Fog zones</h2>
          <div className="row">
            {[...ZONES, 'all'].map((z) => (
              <button key={z} className={state?.revealed?.[z] ? 'on' : ''} onClick={() => onReveal(z)}>{z}</button>
            ))}
            <button onClick={onRefog}>re-fog</button>
          </div>
        </section>
      )}

      {info && (
        <section>
          <h2>Places</h2>
          <ul className="places">
            {info.pois.map((p) => (
              <li key={p.n}>
                <button onClick={() => onFocus(p)}><b>{p.n}</b><small>{KIND[p.k]}</small></button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bottom">
        <button onClick={onSave} disabled={mapBusy}>Save PNG</button>
        <small className="hint">Two-finger scroll or drag to move. Pinch, Ctrl/Cmd + scroll, double-click, or +/− keys to zoom.</small>
      </section>
    </aside>
  )
}
