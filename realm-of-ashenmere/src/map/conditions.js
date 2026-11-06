// ---------- YOUR CONDITIONS GO HERE ----------
// Polled every 300ms; when a zone's function returns true its fog lifts (once per map).
// e.g. north: () => window.questFlags?.northGateOpen === true
export const conditions = {
  north: () => false,
  east: () => false,
  south: () => false,
  west: () => false,
}
