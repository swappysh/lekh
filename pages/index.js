import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [content, setContent] = useState('')
  const [docId, setDocId] = useState('main')

  useEffect(() => {
    loadContent()
  }, [])

  useEffect(() => {
    const saveTimeout = setTimeout(() => {
      if (content) {
        saveContent()
      }
    }, 1000)

    return () => clearTimeout(saveTimeout)
  }, [content])

  const loadContent = async () => {
    console.log('Loading content for doc:', docId)
    const { data, error } = await supabase
      .from('documents')
      .select('content')
      .eq('id', docId)
      .single()
    
    console.log('Load result:', { data, error })
    if (data) {
      setContent(data.content || '')
    }
  }

  const saveContent = async () => {
    console.log('Saving content:', content.length, 'characters')
    const { data, error } = await supabase
      .from('documents')
      .upsert({ id: docId, content, updated_at: new Date() })
    
    console.log('Save result:', { data, error })
  }

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
          border: 'none',
          outline: 'none',
          resize: 'none',
          background: 'transparent'
        }}
        placeholder="Start writing..."
      />
    </div>
  )
}