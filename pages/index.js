import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import Editor from '../components/Editor'
import { ShortcutsModal } from '../components/ShortcutsModal'

export default function Home() {
  const [content, setContent] = useState('')
  const [docId, setDocId] = useState('main')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const editorRef = useRef(null)
  const [isMac, setIsMac] = useState(false)

  // Platform detection
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const platform =
        navigator.userAgentData?.platform || navigator.platform || ''
      const mac = /mac/i.test(platform)
      setIsMac(mac)
    }
  }, [])
  
  const insertDateTime = useCallback(() => {
    const editor = editorRef.current
    if (!editor) {
      return
    }
    const start = editor.selectionStart
    const end = editor.selectionEnd
    const dateString = new Date().toLocaleString()
    setContent((prev) => {
      const newContent = prev.slice(0, start) + dateString + prev.slice(end)
      requestAnimationFrame(() => {
        editor.selectionStart = editor.selectionEnd = start + dateString.length
      })
      return newContent
    })
  }, [])

  const loadContent = async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('content')
      .eq('id', docId)
      .single()
    
    if (data) {
      setContent(data.content || '')
    }
  }

  const saveContent = async () => {
    const { data, error } = await supabase
      .from('documents')
      .upsert({ id: docId, content, updated_at: new Date() })
  }

  const shortcuts = useMemo(() => [
    { keys: 'Shift + ?', description: 'Toggle this help' },
    {
      keys: 'Ctrl + Alt + D',
      description: 'Insert current date and time'
    }
  ], [isMac])

  const keyboardShortcuts = useMemo(() => ({
    onToggleHelp: () => setShowShortcuts((prev) => !prev),
    onInsertDateTime: insertDateTime,
    onEscape: () => setShowShortcuts(false)
  }), [insertDateTime])

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isDateShortcut = e.ctrlKey && e.altKey && e.code === 'KeyD'

      if (e.shiftKey && e.key === '?') {
        e.preventDefault()
        keyboardShortcuts.onToggleHelp?.()
      } else if (isDateShortcut) {
        e.preventDefault()
        keyboardShortcuts.onInsertDateTime?.()
      } else if (e.key === 'Escape') {
        keyboardShortcuts.onEscape?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [keyboardShortcuts, isMac])

  return (
    <div className="container">
      <h1>Lekh</h1>
      <Editor content={content} setContent={setContent} ref={editorRef} />
      <ShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        shortcuts={shortcuts}
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
          width: 70vw;
          margin: 0 auto;
        }
      `}</style>
    </div>
  )
}
