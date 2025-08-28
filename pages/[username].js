import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '../components/Editor'
import CollaborativeEditor from '../components/CollaborativeEditor'
import PasswordModal from '../components/PasswordModal'
import { ShortcutsModal } from '../components/ShortcutsModal'
import { PublicKeyEncryption } from '../lib/publicKeyEncryption'
import { CollaborativeDocument } from '../lib/collaborativeDocument'
import { supabase } from '../lib/supabase'

export default function UserPage() {
  const router = useRouter()
  const { username } = router.query
  const [content, setContent] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [userExists, setUserExists] = useState(null)
  const [publicKey, setPublicKey] = useState(null)
  const editorRef = useRef(null)
  const [isMac, setIsMac] = useState(false)
  const [isPublic, setIsPublic] = useState(false)
  const [collaborativeDoc, setCollaborativeDoc] = useState(null)
  const [activeEditors, setActiveEditors] = useState([])
  const [collaborativeContent, setCollaborativeContent] = useState('')

  // Generate unique document ID for each user session
  useEffect(() => {
    if (username) {
      const docId = crypto.randomUUID()
      setDocumentId(docId)
    }
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

  const saveContent = async () => {
    if (!documentId || !userExists || !publicKey) return

    // Don't save empty content
    if (!content || content.trim() === '') return

    try {
      // Encrypt content using public key encryption (hybrid encryption)
      const { encryptedContent, encryptedDataKey } = await PublicKeyEncryption.encrypt(content, publicKey)

      const { data, error } = await supabase
        .from('documents')
        .upsert({
          id: documentId,
          username,
          encrypted_content: encryptedContent,
          encrypted_data_key: encryptedDataKey,
          updated_at: new Date()
        })

      if (error) {
        console.error('Failed to save document:', error)
      }
    } catch (error) {
      console.error('Failed to encrypt content:', error)
    }
  }


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
        if (doc && !doc.isConnected) {
          console.log('Connection lost, attempting to reconnect...')
          doc.checkConnectionHealth()
        }
      }, 30000) // Check every 30 seconds

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
    if (!userExists || isPublic) return

    const saveTimeout = setTimeout(() => {
      if (content !== undefined) {
        saveContent()
      }
    }, 1000)

    return () => clearTimeout(saveTimeout)
  }, [content, userExists, isPublic])

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
            font-family: monospace;
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

  return (
    <div className="container">
      <h1>{username}</h1>
      {isPublic && <div className="public-label">Public Page</div>}
      {isPublic ? (
        <CollaborativeEditor 
          content={collaborativeContent}
          onContentChange={handleCollaborativeChange}
          onCursorChange={handleCursorChange}
          activeEditors={activeEditors}
          isCollaborative={true}
          ref={editorRef}
        />
      ) : (
        <Editor content={content} setContent={setContent} ref={editorRef} />
      )}
      <ShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        shortcuts={shortcuts}
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
        .help-button {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #0B57D0;
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
        }
        .help-button:hover {
          background: #0842A0;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        @media (prefers-color-scheme: dark) {
          .help-button {
            background: #8AB4F8;
            color: #0B0B0C;
          }
          .help-button:hover {
            background: #A8C7FA;
          }
        }
        .public-label {
          font-weight: bold;
          margin-bottom: 10px;
        }
      `}</style>
    </div>
  )
}