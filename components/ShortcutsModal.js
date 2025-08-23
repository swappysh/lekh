export const ShortcutsModal = ({ isOpen, onClose, shortcuts }) => {
  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#333',
          padding: '20px',
          borderRadius: '8px',
          minWidth: '300px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Keyboard Shortcuts</h2>
        <ul>
          {shortcuts.map((s) => (
            <li key={s.description}>
              <strong>{s.keys}</strong>: {s.description}
            </li>
          ))}
        </ul>
        <p>Press Esc to close</p>
      </div>
    </div>
  )
}