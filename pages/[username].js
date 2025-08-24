import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import Editor from '../components/Editor'
import { ShortcutsModal } from '../components/ShortcutsModal'
import PasswordModal from '../components/PasswordModal'
import { generateSalt, deriveKey, encryptContent } from '../lib/encryption'

export default function UserPage() {
  const router = useRouter()
  const { username } = router.query
  const [content, setContent] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [userExists, setUserExists] = useState(null)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [userSalt, setUserSalt] = useState(null)
  const [encryptionKey, setEncryptionKey] = useState(null)
  const [pendingSave, setPendingSave] = useState(null)
  const editorRef = useRef(null)
  const [isMac, setIsMac] = useState(false)

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
    
    // Check if user exists and get salt
    const { data: userData } = await supabase
      .from('users')
      .select('username, salt')
      .eq('username', username)
    
    if (!userData || userData.length === 0) {
      setUserExists(false)
      return
    }
    
    setUserExists(true)
    setUserSalt(userData[0].salt)
    
    // Each page load gets a fresh, isolated document
    // No reading back of previous content - start fresh each time
    setContent('')
  }

  const saveContent = async () => {
    if (!documentId || !userExists) return
    
    // Don't save empty content
    if (!content || content.trim() === '') return
    
    // Check if we need password for encryption
    if (!encryptionKey) {
      setPendingSave({ documentId, content })
      setShowPasswordModal(true)
      return
    }
    
    // Encrypt content before saving
    const encryptedContent = await encryptContent(content, encryptionKey)
    
    const { data, error } = await supabase
      .from('documents')
      .upsert({ 
        id: documentId,
        username, 
        content: encryptedContent, 
        updated_at: new Date() 
      })
  }
  
  const handlePasswordSubmit = async (password) => {
    if (!userSalt || !pendingSave) return
    
    try {
      const key = await deriveKey(password, userSalt)
      setEncryptionKey(key)
      
      // Encrypt and save the pending content
      const encryptedContent = await encryptContent(pendingSave.content, key)
      
      await supabase
        .from('documents')
        .upsert({ 
          id: pendingSave.documentId,
          username, 
          content: encryptedContent, 
          updated_at: new Date() 
        })
      
      setPendingSave(null)
      setShowPasswordModal(false)
    } catch (error) {
      console.error('Encryption failed:', error)
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

  useEffect(() => {
    if (!userExists) return
    
    const saveTimeout = setTimeout(() => {
      if (content !== undefined) {
        saveContent()
      }
    }, 1000)

    return () => clearTimeout(saveTimeout)
  }, [content, userExists])

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
        <p><a href="/users">Create a new user URL</a></p>
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
      <Editor content={content} setContent={setContent} ref={editorRef} />
      <ShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        shortcuts={shortcuts}
      />
      <PasswordModal
        isOpen={showPasswordModal}
        onSubmit={handlePasswordSubmit}
        onClose={() => {
          setShowPasswordModal(false)
          setPendingSave(null)
        }}
        title="Enter Password to Encrypt"
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
      `}</style>
    </div>
  )
}