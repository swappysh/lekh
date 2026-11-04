import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { PublicKeyEncryption } from '../../lib/publicKeyEncryption'
import { supabase } from '../../lib/supabase'
import { changePassword } from '../../lib/changePassword'
import { MIN_PASSWORD_LENGTH } from '../../lib/constants'

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
  const [isPublicUser, setIsPublicUser] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [changeStatus, setChangeStatus] = useState({ busy: false, error: '', done: false })

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
    setIsPublicUser(Boolean(userData[0].is_public))
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

  const handleChangePassword = async (event) => {
    event.preventDefault()
    const form = new FormData(event.target)
    const oldPassword = String(form.get('oldPassword') || '')
    const newPassword = String(form.get('newPassword') || '')
    const confirmPassword = String(form.get('confirmPassword') || '')

    if (newPassword !== confirmPassword) {
      setChangeStatus({ busy: false, error: 'New passwords do not match', done: false })
      return
    }

    setChangeStatus({ busy: true, error: '', done: false })
    try {
      await changePassword({ username, oldPassword, newPassword })
      setChangeStatus({ busy: false, error: '', done: true })
      setShowChangePassword(false)
      await loadAllEntries()
    } catch (error) {
      setChangeStatus({ busy: false, error: error.message, done: false })
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

  return (
    <div className="container">
      <div className="page-header">
        <span className="header-username">{username}</span>
        <span className="header-separator"> / </span>
        <span className="header-section">all entries</span>
        {!isPublicUser && (
          <button
            type="button"
            className="change-password-link"
            onClick={() => setShowChangePassword((open) => !open)}
          >
            [change password]
          </button>
        )}
      </div>

      {changeStatus.done && (
        <p className="change-done">Password changed. Unlock with your new password.</p>
      )}

      {showChangePassword && (
        <form className="change-password-form" onSubmit={handleChangePassword}>
          <div className="prompt-group">
            <label htmlFor="oldPassword">Current password</label>
            <input id="oldPassword" type="password" name="oldPassword" required autoFocus />
          </div>
          <div className="prompt-group">
            <label htmlFor="newPassword">New password (min {MIN_PASSWORD_LENGTH} characters)</label>
            <input id="newPassword" type="password" name="newPassword" minLength={MIN_PASSWORD_LENGTH} required />
          </div>
          <div className="prompt-group">
            <label htmlFor="confirmPassword">Confirm new password</label>
            <input id="confirmPassword" type="password" name="confirmPassword" minLength={MIN_PASSWORD_LENGTH} required />
          </div>
          <button type="submit" className="unlock-button" disabled={changeStatus.busy}>
            {changeStatus.busy ? 'Changing...' : '[Change password →]'}
          </button>
          {changeStatus.error && <p className="warning-text">{changeStatus.error}</p>}
          <p className="warning-text">There is no recovery if you forget this.</p>
        </form>
      )}

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
              <label>Your password</label>
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
          <p className="warning-text">⚠️ There's no recovery if you forget this.</p>
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
          padding: 40px 20px;
          font-family: var(--font-mono);
          max-width: 800px;
          margin: 0 auto;
        }
        .page-header {
          font-size: 16px;
          margin-bottom: 40px;
          color: var(--color-gray-darker);
        }
        .header-username {
          color: var(--color-text);
          font-weight: bold;
        }
        .header-separator {
          color: var(--color-gray);
        }
        .header-section {
          color: var(--color-gray-darker);
        }
        .change-password-link {
          margin-left: 16px;
          background: none;
          border: none;
          padding: 0;
          font-family: var(--font-mono);
          font-size: 14px;
          color: var(--color-accent);
          text-decoration: underline;
          cursor: pointer;
        }
        .change-done {
          color: var(--color-text);
          margin-bottom: 24px;
        }
        .change-password-form {
          max-width: 400px;
          margin: 0 auto 40px;
        }
        .unlock-button:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .password-prompt {
          max-width: 400px;
          margin: 100px auto;
          text-align: center;
        }
        .prompt-title {
          font-size: 18px;
          margin-bottom: 30px;
          color: var(--color-text);
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
          border: 1px solid var(--color-border);
          border-radius: 4px;
          font-family: var(--font-mono);
          font-size: 16px;
          box-sizing: border-box;
        }
        .prompt-group input:focus {
          outline: none;
          border-color: var(--color-accent);
          box-shadow: 0 0 0 2px rgba(var(--color-accent-rgb), 0.1);
        }
        .unlock-button {
          width: 100%;
          padding: 12px 24px;
          background: var(--color-text);
          color: white;
          border: none;
          border-radius: 4px;
          font-family: var(--font-mono);
          font-size: 16px;
          cursor: pointer;
          margin-bottom: 20px;
        }
        .unlock-button:hover {
          background: var(--color-gray-text);
        }
        .warning-text {
          font-size: 14px;
          color: var(--color-error);
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
          border-bottom: 1px solid var(--color-border-light);
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
          color: var(--color-gray-darker);
          font-weight: bold;
        }
        .entry-content {
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        @media (prefers-color-scheme: dark) {
          .entry {
            border-bottom: 1px solid var(--color-border-light);
          }
          .entry-date {
            color: var(--color-gray);
          }
          .page-header {
            color: var(--color-gray);
          }
          .header-username {
            color: var(--color-text);
          }
          .prompt-title {
            color: var(--color-text);
          }
          .prompt-group input {
            background: var(--color-surface-dark);
            border-color: var(--color-border);
            color: white;
          }
          .prompt-group input:focus {
            border-color: var(--color-accent);
            box-shadow: 0 0 0 2px rgba(var(--color-accent-rgb), 0.1);
          }
          .unlock-button {
            background: white;
            color: var(--color-bg);
          }
          .unlock-button:hover {
            background: var(--color-text);
          }
          .warning-text {
            color: var(--color-error);
          }
        }
      `}</style>
    </div>
  )
}
