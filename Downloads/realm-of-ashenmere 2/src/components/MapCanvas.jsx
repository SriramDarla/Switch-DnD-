import { useEffect, useRef } from 'react'
import { MapEngine } from '../map/MapEngine.js'

export default function MapCanvas({ onEngine }) {
  const ref = useRef(null)
  useEffect(() => {
    const engine = new MapEngine(ref.current)
    onEngine(engine)
    return () => { engine.destroy(); onEngine(null) }
  }, [onEngine])
  return <canvas ref={ref} className="map" />
}
