import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '../components/Editor'
import { ShortcutsModal } from '../components/ShortcutsModal'

export default function DemoPage() {
  const [content, setContent] = useState('> Try the editor - type anything you want.\n> This is a demo space. Nothing is saved.\n\n')
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

  useEffect(() => {
    const handleKeyboard = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '?') {
        e.preventDefault()
        setShowShortcuts((prev) => !prev)
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        insertDateTime()
      }
    }

    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [insertDateTime])

  return (
    <div className="page-container">
      <div className="demo-header">
        <div className="demo-title">
          <h1>lekh.space/demo</h1>
          <span className="demo-badge">Demo - Nothing is saved</span>
        </div>
        <div className="demo-actions">
          <button
            className="create-account-link"
            onClick={() => window.location.href = '/'}
          >
            Create your space →
          </button>
        </div>
      </div>

      <Editor
        content={content}
        setContent={setContent}
        editorRef={editorRef}
        readOnly={false}
      />

      <div className="help-text">
        <p>
          Press {isMac ? '⌘' : 'Ctrl'}+? for shortcuts •{' '}
          Press {isMac ? '⌘' : 'Ctrl'}+Shift+D to insert date/time
        </p>
      </div>

      {showShortcuts && (
        <ShortcutsModal isMac={isMac} onClose={() => setShowShortcuts(false)} />
      )}

      <style jsx global>{`
        body {
          background: var(--color-bg);
          color: var(--color-text);
          font-size: 18px;
          line-height: 1.6;
        }
        @media (prefers-color-scheme: dark) {
          body {
            background: var(--color-bg);
            color: var(--color-text);
          }
        }
      `}</style>
      <style jsx>{`
        .page-container {
          padding: 20px;
          font-family: var(--font-mono);
          max-width: 800px;
          margin: 0 auto;
        }

        .demo-header {
          margin-bottom: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }

        .demo-title {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .demo-title h1 {
          margin: 0;
          font-size: 24px;
        }

        .demo-badge {
          display: inline-block;
          padding: 4px 12px;
          background: var(--color-warning);
          color: #000;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
        }

        .create-account-link {
          padding: 10px 20px;
          background: var(--color-accent);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 14px;
          font-weight: bold;
          transition: all 0.2s;
        }

        .create-account-link:hover {
          background: var(--color-accent-dark);
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(var(--color-accent-rgb), 0.3);
        }

        .help-text {
          margin-top: 20px;
          text-align: center;
          font-size: 14px;
          color: var(--color-gray-darker);
        }

        @media (prefers-color-scheme: dark) {
          .demo-badge {
            background: var(--color-warning-dark);
            color: var(--color-bg);
          }

          .create-account-link {
            background: var(--color-accent);
            color: var(--color-bg);
          }

          .create-account-link:hover {
            background: var(--color-accent-light);
            box-shadow: 0 2px 4px rgba(var(--color-accent-rgb), 0.3);
          }

          .help-text {
            color: var(--color-gray);
          }
        }
      `}</style>
    </div>
  )
}
