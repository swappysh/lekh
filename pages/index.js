import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [content, setContent] = useState('')
  const [docId, setDocId] = useState('main')
  const editorRef = useRef(null)

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

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.style.height = 'auto'
      editorRef.current.style.height = editorRef.current.scrollHeight + 'px'
    }
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
    <div className="container">
      <h1>Lekh</h1>
      <textarea
        ref={editorRef}
        className="editor"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Start writing..."
      />
      <style jsx global>{`
        body {
          background: #FAFAF7;
          color: #111111;
          font-size: 18px;
          line-height: 1.6;
        }
        @media (prefers-color-scheme: dark) {
          body {
            background: #0B0B0C;
            color: #EDEDED;
          }
        }
        a {
          color: #0B57D0;
          text-decoration: underline;
        }
        a:visited {
          color: #6B4FD3;
        }
        @media (prefers-color-scheme: dark) {
          a {
            color: #8AB4F8;
          }
          a:visited {
            color: #B39DDB;
          }
        }
      `}</style>
      <style jsx>{`
        .container {
          padding: 20px;
          font-family: monospace;
          max-width: 70ch;
          margin: 0 auto;
        }
        .editor {
          width: 100%;
          min-height: 100vh;
          padding: 10px;
          font-size: 18px;
          line-height: 1.6;
          font-family: monospace;
          border: none;
          outline: none;
          resize: none;
          background: transparent;
          color: inherit;
          overflow: hidden;
          box-sizing: border-box;
        }
      `}</style>
    </div>
  )
}
