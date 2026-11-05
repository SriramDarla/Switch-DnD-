export default function Compass() {
  return (
    <svg className="compass" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="29" fill="#e8d9b0" stroke="#7a5a2e" strokeWidth="3" />
      <circle cx="32" cy="32" r="23" fill="none" stroke="#7a5a2e" strokeWidth="1" />
      <polygon points="32,8 37,32 32,56 27,32" fill="#8b1e1e" />
      <polygon points="8,32 32,27 56,32 32,37" fill="#3b2a14" />
      <polygon points="32,8 37,32 27,32" fill="#c0392b" />
      <circle cx="32" cy="32" r="3" fill="#e8d9b0" stroke="#3b2a14" />
      <text x="32" y="6.5" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#3b2a14" fontFamily="Georgia,serif">N</text>
    </svg>
  )
}
