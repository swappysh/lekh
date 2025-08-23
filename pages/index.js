import { useState } from 'react'

export default function Home() {
  const [content, setContent] = useState('')

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Lekh</h1>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        style={{
          width: '100%',
          height: '400px',
          padding: '10px',
          fontSize: '14px',
          fontFamily: 'monospace',
          border: '1px solid #ccc',
          borderRadius: '4px'
        }}
        placeholder="Start writing..."
      />
    </div>
  )
}