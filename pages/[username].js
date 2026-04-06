import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '../components/Editor'
import CollaborativeEditor from '../components/CollaborativeEditor'
import { ShortcutsModal } from '../components/ShortcutsModal'
import { PublicKeyEncryption } from '../lib/publicKeyEncryption'
import { CollaborativeDocument } from '../lib/collaborativeDocument'
import { supabase } from '../lib/supabase'
import { DEBOUNCE_DELAY, HEALTH_CHECK_INTERVAL, PRIVATE_APPEND_ROUTE, JSON_CONTENT_TYPE_HEADER } from '../lib/constants'

export default function UserPage() {
  const router = useRouter()
  const { username } = router.query
  const [content, setContent] = useState('')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [userExists, setUserExists] = useState(null)
  const [publicKey, setPublicKey] = useState(null)
  const editorRef = useRef(null)
  const contentRef = useRef('')
  const publicKeyRef = useRef(null)
  const lastSavedContentRef = useRef('')
  const pendingSnapshotRef = useRef(null)
  const sessionSnapshotIdRef = useRef('')
  const isSavingRef = useRef(false)
  const [isMac, setIsMac] = useState(false)
  const [isPublic, setIsPublic] = useState(false)
  const [collaborativeDoc, setCollaborativeDoc] = useState(null)
  const [activeEditors, setActiveEditors] = useState([])
  const [collaborativeContent, setCollaborativeContent] = useState('')
  const [saveStatus, setSaveStatus] = useState('idle')

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    publicKeyRef.current = publicKey
  }, [publicKey])

  useEffect(() => {
    pendingSnapshotRef.current = null
    lastSavedContentRef.current = ''
    sessionSnapshotIdRef.current = username ? crypto.randomUUID() : ''
    isSavingRef.current = false
  }, [username])

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
    if (!username) return

    // Check if user exists and get public key and visibility
    const { data: userData } = await supabase
      .from('users')
      .select('username, public_key, is_public, encrypted_private_key, salt')
      .eq('username', username)

    if (!userData || userData.length === 0) {
      setUserExists(false)
      return
    }

    setUserExists(true)
    setPublicKey(userData[0].public_key)
    setIsPublic(userData[0].is_public)
    if (userData[0].is_public) {
      // Public pages use only collaborative documents - no historical entries
      await initCollaborativeDocument()
    } else {
      // Each private page load gets a fresh, isolated document
      setContent('')
    }
  }

  const preparePendingPrivateSnapshot = useCallback(async () => {
    if (!username || !userExists || isPublic) {
      pendingSnapshotRef.current = null
      return null
    }

    const nextContent = contentRef.current
    const nextPublicKey = publicKeyRef.current

    if (!nextPublicKey || nextContent.trim() === '') {
      pendingSnapshotRef.current = null
      return null
    }

    if (nextContent === lastSavedContentRef.current) {
      pendingSnapshotRef.current = null
      return null
    }

    let pendingSnapshot = pendingSnapshotRef.current

    if (!pendingSnapshot || pendingSnapshot.content !== nextContent) {
      const sessionSnapshotId =
        sessionSnapshotIdRef.current || crypto.randomUUID()
      sessionSnapshotIdRef.current = sessionSnapshotId

      pendingSnapshot = {
        content: nextContent,
        clientSnapshotId: sessionSnapshotId,
        encryptedContent: null,
        encryptedDataKey: null,
        encryptionPromise: null,
      }
      pendingSnapshotRef.current = pendingSnapshot
    }

    if (pendingSnapshot.encryptedContent && pendingSnapshot.encryptedDataKey) {
      return pendingSnapshot
    }

    if (!pendingSnapshot.encryptionPromise) {
      pendingSnapshot.encryptionPromise = PublicKeyEncryption.encrypt(nextContent, nextPublicKey)
        .then(({ encryptedContent, encryptedDataKey }) => {
          if (pendingSnapshotRef.current === pendingSnapshot) {
            pendingSnapshot.encryptedContent = encryptedContent
            pendingSnapshot.encryptedDataKey = encryptedDataKey
          }
        })
        .catch((error) => {
          if (pendingSnapshotRef.current === pendingSnapshot) {
            pendingSnapshotRef.current = null
          }
          console.error('Failed to encrypt private snapshot:', error)
        })
        .finally(() => {
          if (pendingSnapshotRef.current === pendingSnapshot) {
            pendingSnapshot.encryptionPromise = null
          }
        })
    }

    await pendingSnapshot.encryptionPromise

    if (
      pendingSnapshotRef.current === pendingSnapshot &&
      pendingSnapshot.encryptedContent &&
      pendingSnapshot.encryptedDataKey
    ) {
      return pendingSnapshot
    }

    return null
  }, [username, userExists, isPublic])

  const sendPendingPrivateSnapshot = useCallback(async (pendingSnapshot, { keepalive = false } = {}) => {
    const response = await fetch(PRIVATE_APPEND_ROUTE, {
      method: 'POST',
      headers: JSON_CONTENT_TYPE_HEADER,
      keepalive,
      body: JSON.stringify({
        username,
        clientSnapshotId: pendingSnapshot.clientSnapshotId,
        encryptedContent: pendingSnapshot.encryptedContent,
        encryptedDataKey: pendingSnapshot.encryptedDataKey,
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      const errorMessage = payload?.error || 'Failed to append private snapshot'
      console.error(errorMessage)
      return false
    }

    lastSavedContentRef.current = pendingSnapshot.content
    if (
      pendingSnapshotRef.current &&
      pendingSnapshotRef.current.clientSnapshotId === pendingSnapshot.clientSnapshotId
    ) {
      pendingSnapshotRef.current = null
    }
    return true
  }, [username])

  const appendPrivateSnapshot = useCallback(async ({ keepalive = false } = {}) => {
    if (!username || !userExists || isPublic || isSavingRef.current) {
      return false
    }

    isSavingRef.current = true
    setSaveStatus('saving')
    try {
      const pendingSnapshot = await preparePendingPrivateSnapshot()
      if (!pendingSnapshot) {
        return false
      }

      const success = await sendPendingPrivateSnapshot(pendingSnapshot, { keepalive })

      if (success) {
        setSaveStatus('saved')
        setTimeout(() => {
          setSaveStatus('idle')
        }, 3000)
      }

      return success
    } catch (error) {
      console.error('Failed to append private snapshot:', error)
      return false
    } finally {
      isSavingRef.current = false
    }
  }, [username, userExists, isPublic, preparePendingPrivateSnapshot, sendPendingPrivateSnapshot])

  const flushPreparedSnapshot = useCallback(() => {
    if (!username || !userExists || isPublic) {
      return
    }

    const pendingSnapshot = pendingSnapshotRef.current
    if (
      !pendingSnapshot ||
      pendingSnapshot.content !== contentRef.current ||
      !pendingSnapshot.encryptedContent ||
      !pendingSnapshot.encryptedDataKey
    ) {
      return
    }

    const requestBody = JSON.stringify({
      username,
      clientSnapshotId: pendingSnapshot.clientSnapshotId,
      encryptedContent: pendingSnapshot.encryptedContent,
      encryptedDataKey: pendingSnapshot.encryptedDataKey,
    })

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const queued = navigator.sendBeacon(
        PRIVATE_APPEND_ROUTE,
        new Blob([requestBody], { type: 'application/json' })
      )
      if (queued) {
        return
      }
    }

    void fetch(PRIVATE_APPEND_ROUTE, {
      method: 'POST',
      headers: JSON_CONTENT_TYPE_HEADER,
      keepalive: true,
      body: requestBody,
    }).then(async (response) => {
      if (response.ok) {
        lastSavedContentRef.current = pendingSnapshot.content
        if (
          pendingSnapshotRef.current &&
          pendingSnapshotRef.current.clientSnapshotId === pendingSnapshot.clientSnapshotId
        ) {
          pendingSnapshotRef.current = null
        }
        return
      }

      const payload = await response.json().catch(() => null)
      const errorMessage = payload?.error || 'Failed to flush private snapshot'
      console.error(errorMessage)
    }).catch((error) => {
      console.error('Failed to flush private snapshot:', error)
    })
  }, [username, userExists, isPublic])

  const shortcuts = useMemo(() => [
    {
      keys: isMac ? 'Ctrl + Option + D' : 'Ctrl + Alt + D',
      description: 'Insert current date and time'
    }
  ], [isMac])

  const keyboardShortcuts = useMemo(() => ({
    onInsertDateTime: insertDateTime,
    onEscape: () => setShowShortcuts(false)
  }), [insertDateTime])

  useEffect(() => {
    if (username) {
      loadContent()
    }
  }, [username])

  // Cleanup collaborative document on unmount
  useEffect(() => {
    return () => {
      if (collaborativeDoc) {
        // Clear health check interval
        if (collaborativeDoc.healthCheckInterval) {
          clearInterval(collaborativeDoc.healthCheckInterval)
        }
        collaborativeDoc.disconnect()
      }
    }
  }, [collaborativeDoc])

  // Initialize collaborative document for public pages
  const initCollaborativeDocument = async () => {
    try {
      const doc = new CollaborativeDocument(username)
      await doc.init()

      doc.setOnContentChange((newContent) => {
        setCollaborativeContent(newContent)
      })

      doc.setOnActiveEditorsChange((editors) => {
        setActiveEditors(editors)
      })

      setCollaborativeDoc(doc)
      setCollaborativeContent(doc.getContent())

      // Set up periodic connection health checks
      const healthCheckInterval = setInterval(() => {
        if (!doc.isConnected) {
          console.log('Connection lost, attempting to reconnect...')
          doc.checkConnectionHealth()
        }
      }, HEALTH_CHECK_INTERVAL)

      // Store interval ID for cleanup
      doc.healthCheckInterval = healthCheckInterval
    } catch (error) {
      console.error('Failed to initialize collaborative document:', error)
    }
  }

  // Handle collaborative content changes
  const handleCollaborativeChange = async (newContent, cursorPosition) => {
    if (collaborativeDoc) {
      await collaborativeDoc.handleLocalChange(newContent, cursorPosition)
    }
  }

  // Handle cursor position changes for collaboration
  const handleCursorChange = async (cursorPosition) => {
    if (collaborativeDoc) {
      await collaborativeDoc.updateCursorPosition(cursorPosition)
    }
  }

  useEffect(() => {
    if (!userExists || isPublic) {
      pendingSnapshotRef.current = null
      return
    }

    const timeoutId = setTimeout(() => {
      void preparePendingPrivateSnapshot()
    }, DEBOUNCE_DELAY)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [content, userExists, isPublic, preparePendingPrivateSnapshot])

  useEffect(() => {
    if (!userExists || isPublic) {
      return
    }

    const intervalId = setInterval(() => {
      void appendPrivateSnapshot()
    }, 20000)

    return () => {
      clearInterval(intervalId)
    }
  }, [userExists, isPublic, appendPrivateSnapshot])

  useEffect(() => {
    if (!userExists || isPublic) {
      return
    }

    const handleBeforeUnload = () => {
      flushPreparedSnapshot()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPreparedSnapshot()
        void appendPrivateSnapshot({ keepalive: true })
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      flushPreparedSnapshot()
    }
  }, [userExists, isPublic, appendPrivateSnapshot, flushPreparedSnapshot])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isDateShortcut = e.ctrlKey && e.altKey && e.code === 'KeyD'

      if (isDateShortcut) {
        e.preventDefault()
        keyboardShortcuts.onInsertDateTime?.()
      } else if (e.key === 'Escape') {
        keyboardShortcuts.onEscape?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [keyboardShortcuts, isMac])

  if (userExists === null) {
    return (
      <div className="container">
        <div className="loading">Loading...</div>
        <style jsx>{`
          .container {
            padding: 20px;
            font-family: var(--font-mono);
            width: 70vw;
            margin: 0 auto;
          }
          .loading {
            text-align: center;
            padding: 40px;
          }
        `}</style>
      </div>
    )
  }

  if (userExists === false) {
    return (
      <div className="container">
        <h1>User Not Found</h1>
        <p>The user "{username}" doesn't exist.</p>
        <p><a href="/">Create a new user URL</a></p>
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
          a {
            color: var(--color-accent);
            text-decoration: underline;
          }
          a:visited {
            color: var(--color-link-visited);
          }
          @media (prefers-color-scheme: dark) {
            a {
              color: var(--color-accent);
            }
            a:visited {
              color: var(--color-link-visited-dark);
            }
          }
        `}</style>
        <style jsx>{`
          .container {
            padding: 20px;
            font-family: var(--font-mono);
            width: 70vw;
            margin: 0 auto;
          }
        `}</style>
      </div>
    )
  }

  const visibleContent = isPublic ? collaborativeContent : content

  return (
    <div className="container">
      <div className="header">
        <h1>{username}</h1>
        <span className="header-separator">·</span>
        <a href={`/${username}/all`} className="header-link">all entries</a>
      </div>
      {!isPublic && saveStatus !== 'idle' && (
        <div className={`save-status-indicator save-status-${saveStatus}`}>
          <span className="save-status-icon">
            {saveStatus === 'saving' ? '⟳' : '✓'}
          </span>
          <span className="save-status-text">
            {saveStatus === 'saving' ? 'saving' : 'saved'}
          </span>
        </div>
      )}
      {isPublic && activeEditors.length > 0 && (
        <div className="collaboration-hint">
          {activeEditors.length} other{activeEditors.length !== 1 ? 's' : ''} writing
        </div>
      )}
      {isPublic ? (
        <CollaborativeEditor 
          content={collaborativeContent}
          onContentChange={handleCollaborativeChange}
          onCursorChange={handleCursorChange}
          activeEditors={activeEditors}
          isCollaborative={true}
          showActiveIndicator={false}
          ref={editorRef}
        />
      ) : (
        <Editor content={content} setContent={setContent} ref={editorRef} />
      )}
      <div className="stats">
        <span className="word-count">
          {visibleContent.trim() ? visibleContent.trim().split(/\s+/).length : 0} words
        </span>
        <span className="char-count">{visibleContent.length} characters</span>
      </div>
      <ShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        shortcuts={shortcuts}
        username={username}
      />
      <button
        className="help-button"
        onClick={() => setShowShortcuts(prev => !prev)}
        title="Toggle keyboard shortcuts"
      >
        ?
      </button>
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
        a {
          color: var(--color-accent);
          text-decoration: underline;
        }
        a:visited {
          color: var(--color-link-visited);
        }
        @media (prefers-color-scheme: dark) {
          a {
            color: var(--color-accent);
          }
          a:visited {
            color: var(--color-link-visited-dark);
          }
        }
      `}</style>
      <style jsx>{`
        .container {
          padding: 20px;
          font-family: var(--font-mono);
          width: 70vw;
          margin: 0 auto;
        }
        .header {
          display: flex;
          align-items: baseline;
          gap: 12px;
          margin-bottom: 10px;
        }
        .header h1 {
          margin: 0;
        }
        .header-separator {
          color: var(--color-gray);
        }
        .header-link {
          font-size: 16px;
          color: var(--color-gray-darkest);
          text-decoration: underline;
        }
        .header-link:hover {
          text-decoration: underline;
        }
        .save-status-indicator {
          position: fixed;
          top: 20px;
          right: 20px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 20px;
          background: rgba(153, 153, 153, 0.1);
          font-size: 14px;
          min-height: 44px;
          min-width: 120px;
          animation: bounce-in var(--animation-duration-normal) var(--animation-easing-smooth);
          z-index: 99;
        }
        .save-status-indicator.save-status-saving {
          background: rgba(11, 87, 208, 0.1);
          color: var(--color-loading-saving);
        }
        .save-status-indicator.save-status-saved {
          background: rgba(40, 167, 69, 0.1);
          color: var(--color-loading-saved);
        }
        .save-status-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          line-height: 1;
        }
        .save-status-indicator.save-status-saving .save-status-icon {
          animation: save-indicator-spin var(--animation-duration-slow) linear infinite;
        }
        .save-status-indicator.save-status-saved .save-status-icon {
          animation: none;
        }
        .save-status-text {
          font-weight: 500;
          white-space: nowrap;
        }
        @media (prefers-color-scheme: dark) {
          .header-separator {
            color: var(--color-gray-darker);
          }
          .header-link {
            color: var(--color-gray-lighter);
          }
          .save-status-indicator {
            background: rgba(102, 102, 102, 0.15);
          }
          .save-status-indicator.save-status-saving {
            background: rgba(138, 180, 248, 0.15);
          }
          .save-status-indicator.save-status-saved {
            background: rgba(64, 216, 101, 0.15);
          }
        }
        @media (max-width: 768px) {
          .save-status-indicator {
            top: 16px;
            right: 70px;
            padding: 8px 12px;
            font-size: 13px;
            min-height: 40px;
          }
          .save-status-icon {
            font-size: 14px;
          }
        }
        @media (max-width: 480px) {
          .save-status-indicator {
            top: 12px;
            right: 62px;
            padding: 6px 10px;
            font-size: 12px;
            min-height: 36px;
            gap: 6px;
          }
          .save-status-icon {
            font-size: 12px;
          }
        }
        /* Reduced motion support - disable animations for accessibility */
        @media (prefers-reduced-motion: reduce) {
          .save-status-indicator {
            animation: none;
          }
          .save-status-indicator.save-status-saving .save-status-icon {
            animation: none;
          }
        }
        .collaboration-hint {
          font-size: 14px;
          color: var(--color-gray-darker);
          margin-bottom: 10px;
          font-weight: normal;
        }
        @media (prefers-color-scheme: dark) {
          .collaboration-hint {
            color: var(--color-gray);
          }
        }
        .stats {
          position: fixed;
          bottom: 20px;
          left: 20px;
          font-size: 12px;
          color: var(--color-gray);
          display: flex;
          gap: 20px;
        }
        @media (prefers-color-scheme: dark) {
          .stats {
            color: var(--color-gray-darker);
          }
        }
        @media (max-width: 480px) {
          .stats {
            font-size: 11px;
            gap: 12px;
            bottom: 70px;
          }
        }
        .help-button {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: var(--color-accent);
          color: white;
          border: none;
          font-size: 18px;
          font-weight: bold;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          transition: all 0.2s ease;
          touch-action: manipulation;
        }
        .help-button:hover {
          background: var(--color-accent-dark);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        .help-button:active {
          transform: scale(0.95);
        }
        @media (max-width: 480px) {
          .help-button {
            width: 48px;
            height: 48px;
            font-size: 20px;
          }
        }
        @media (prefers-color-scheme: dark) {
          .help-button {
            background: var(--color-accent);
            color: var(--color-bg);
          }
          .help-button:hover {
            background: var(--color-accent-light);
          }
        }
      `}</style>
    </div>
  )
}
