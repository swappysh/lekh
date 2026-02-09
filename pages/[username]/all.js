import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { PublicKeyEncryption } from '../../lib/publicKeyEncryption'
import { supabase } from '../../lib/supabase'

const getPrivateEntryTimestamp = (entry) => entry.updated_at || entry.created_at || null

export default function AllEntriesPage() {
  const router = useRouter()
  const { username } = router.query
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [userExists, setUserExists] = useState(null)
  const [userSalt, setUserSalt] = useState(null)
  const [encryptedPrivateKey, setEncryptedPrivateKey] = useState(null)
  const [encryptedEntries, setEncryptedEntries] = useState([])
  const [decryptionAttempted, setDecryptionAttempted] = useState(false)

  const loadAllEntries = async () => {
    if (!username) return

    setLoading(true)
    setEntries([])
    setEncryptedEntries([])
    setDecryptionAttempted(false)

    // Check if user exists and get encryption data
    const { data: userData } = await supabase
      .from('users')
      .select('username, salt, encrypted_private_key, is_public')
      .eq('username', username)

    if (!userData || userData.length === 0) {
      setUserExists(false)
      setLoading(false)
      return
    }

    setUserExists(true)
    setUserSalt(userData[0].salt)
    setEncryptedPrivateKey(userData[0].encrypted_private_key)

    if (userData[0].is_public) {
      const { data: snapshots } = await supabase
        .from('public_snapshots')
        .select('username, snapshot_minute, content, version')
        .eq('username', username)
        .order('snapshot_minute', { ascending: false })

      setEntries(
        (snapshots || []).map((snapshot) => ({
          id: `${snapshot.username}-${snapshot.snapshot_minute}`,
          content: snapshot.content,
          snapshot_minute: snapshot.snapshot_minute,
          version: snapshot.version,
        }))
      )
      setEncryptedEntries([])
      setDecryptionAttempted(true)
      setLoading(false)
      return
    }

    const { data: documents } = await supabase
      .from('documents')
      .select('id, username, encrypted_content, encrypted_data_key, created_at, updated_at, client_snapshot_id')
      .eq('username', username)
      .order('created_at', { ascending: false })

    if (documents && documents.length > 0) {
      const sortedDocuments = [...documents].sort((a, b) => {
        const timeA = new Date(getPrivateEntryTimestamp(a) || 0).getTime()
        const timeB = new Date(getPrivateEntryTimestamp(b) || 0).getTime()
        return timeB - timeA
      })
      setEncryptedEntries(sortedDocuments)
    } else {
      setEncryptedEntries([])
      setEntries([])
    }
    setLoading(false)
  }

  const handlePasswordSubmit = async (password) => {
    if (!userSalt || !encryptedPrivateKey || !encryptedEntries.length) return

    try {
      const decryptedEntries = []

      for (const entry of encryptedEntries) {
        try {
          // Decrypt content using public key encryption
          const decryptedContent = await PublicKeyEncryption.decrypt(
            entry.encrypted_content,
            entry.encrypted_data_key,
            password,
            encryptedPrivateKey,
            userSalt
          )
          
          decryptedEntries.push({
            ...entry,
            content: decryptedContent
          })
        } catch (error) {
          console.error('Failed to decrypt entry:', entry.id, error)
          decryptedEntries.push({
            ...entry,
            content: '[Decryption failed - invalid password or corrupted data]'
          })
        }
      }

      setEntries(decryptedEntries)
      setDecryptionAttempted(true)
    } catch (error) {
      console.error('Decryption process failed:', error)
      alert('Invalid password. Please try again.')
    }
  }

  useEffect(() => {
    if (username) {
      loadAllEntries()
    }
  }, [username])

  if (loading) {
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
      <div className="page-header">
        <span className="header-username">{username}</span>
        <span className="header-separator"> / </span>
        <span className="header-section">all entries</span>
      </div>

      {!decryptionAttempted && encryptedEntries.length > 0 ? (
        <div className="password-prompt">
          <p className="prompt-title">Enter password to decrypt entries</p>
          <form onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.target)
            const password = formData.get('password')
            if (password && password.trim()) {
              handlePasswordSubmit(password)
            }
          }}>
            <div className="prompt-group">
              <label>Password:</label>
              <input
                type="password"
                name="password"
                placeholder="••••••••"
                autoFocus
                required
              />
            </div>
            <button type="submit" className="unlock-button">
              [Unlock →]
            </button>
          </form>
          <p className="warning-text">⚠️ Forgot? Your entries are lost forever.</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="no-entries">
          <p>No entries found for {username}</p>
        </div>
      ) : (
        <div className="entries-list">
          {entries.map((entry) => (
            <div key={entry.id} className="entry">
              <div className="entry-header">
                <span className="entry-date">
                  {new Date(entry.snapshot_minute || getPrivateEntryTimestamp(entry)).toLocaleString()}
                </span>
              </div>
              <div className="entry-content">
                {entry.content}
              </div>
            </div>
          ))}
        </div>
      )}

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
          padding: 40px 20px;
          font-family: monospace;
          max-width: 800px;
          margin: 0 auto;
        }
        .page-header {
          font-size: 16px;
          margin-bottom: 40px;
          color: #666;
        }
        .header-username {
          color: #111111;
          font-weight: bold;
        }
        .header-separator {
          color: #999;
        }
        .header-section {
          color: #666;
        }
        .password-prompt {
          max-width: 400px;
          margin: 100px auto;
          text-align: center;
        }
        .prompt-title {
          font-size: 18px;
          margin-bottom: 30px;
          color: #111111;
        }
        .prompt-group {
          margin-bottom: 20px;
          text-align: left;
        }
        .prompt-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
        }
        .prompt-group input {
          width: 100%;
          padding: 12px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-family: monospace;
          font-size: 16px;
          box-sizing: border-box;
        }
        .prompt-group input:focus {
          outline: none;
          border-color: #0B57D0;
          box-shadow: 0 0 0 2px rgba(11, 87, 208, 0.1);
        }
        .unlock-button {
          width: 100%;
          padding: 12px 24px;
          background: #111111;
          color: white;
          border: none;
          border-radius: 4px;
          font-family: monospace;
          font-size: 16px;
          cursor: pointer;
          margin-bottom: 20px;
        }
        .unlock-button:hover {
          background: #333;
        }
        .warning-text {
          font-size: 14px;
          color: #dc3545;
          margin: 0;
        }
        .header {
          margin-bottom: 30px;
        }
        .header h1 {
          margin-bottom: 10px;
        }
        .header p {
          margin: 0;
        }
        .no-entries {
          text-align: center;
          padding: 40px 0;
        }
        .entries-list {
          display: flex;
          flex-direction: column;
          gap: 30px;
        }
        .entry {
          border-bottom: 1px solid #ddd;
          padding-bottom: 20px;
        }
        .entry:last-child {
          border-bottom: none;
        }
        .entry-header {
          margin-bottom: 10px;
        }
        .entry-date {
          font-size: 14px;
          color: #666;
          font-weight: bold;
        }
        .entry-content {
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        @media (prefers-color-scheme: dark) {
          .entry {
            border-bottom: 1px solid #333;
          }
          .entry-date {
            color: #999;
          }
          .page-header {
            color: #999;
          }
          .header-username {
            color: #EDEDED;
          }
          .prompt-title {
            color: #EDEDED;
          }
          .prompt-group input {
            background: #333;
            border-color: #555;
            color: white;
          }
          .prompt-group input:focus {
            border-color: #8AB4F8;
            box-shadow: 0 0 0 2px rgba(138, 180, 248, 0.1);
          }
          .unlock-button {
            background: white;
            color: #0B0B0C;
          }
          .unlock-button:hover {
            background: #EDEDED;
          }
          .warning-text {
            color: #ff6b6b;
          }
        }
      `}</style>
    </div>
  )
}
