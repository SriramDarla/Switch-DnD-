export default function ZoomControls({ pct, onIn, onOut, onReset, onFit }) {
  return (
    <div className="zoom">
      <button onClick={onOut} title="Zoom out (-)" aria-label="Zoom out">−</button>
      <button className="pct" onClick={onReset} title="Reset zoom (0)">{pct}%</button>
      <button onClick={onIn} title="Zoom in (+)" aria-label="Zoom in">+</button>
      <button onClick={onFit} title="Fit whole map">Fit</button>
    </div>
  )
}
