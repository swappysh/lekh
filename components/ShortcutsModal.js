export const ShortcutsModal = ({ isOpen, onClose, shortcuts, username }) => {
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
        <h2 style={{ marginTop: 0 }}>Help</h2>
        
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '10px', color: '#aaa' }}>Navigation</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {username && (
              <li style={{ marginBottom: '8px' }}>
                <a 
                  href={`/${username}/all`}
                  style={{ color: '#8AB4F8', textDecoration: 'none' }}
                >
                  View all entries →
                </a>
              </li>
            )}
            <li>
              <a 
                href="/"
                style={{ color: '#8AB4F8', textDecoration: 'none' }}
              >
                Back to home
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 style={{ fontSize: '14px', marginBottom: '10px', color: '#aaa' }}>Keyboard Shortcuts</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {shortcuts.map((s) => (
              <li key={s.description} style={{ marginBottom: '8px' }}>
                <strong style={{ 
                  background: '#555', 
                  padding: '2px 6px', 
                  borderRadius: '4px',
                  fontSize: '12px',
                  marginRight: '8px'
                }}>{s.keys}</strong>
                {s.description}
              </li>
            ))}
          </ul>
        </div>

        <p style={{ marginTop: '20px', marginBottom: 0, fontSize: '12px', color: '#888' }}>Press Esc to close</p>
      </div>
    </div>
  )
}