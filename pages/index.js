import { useEffect, useState } from 'react'
import { generateSalt } from '../lib/encryption'
import { PublicKeyEncryption } from '../lib/publicKeyEncryption'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [isAvailable, setIsAvailable] = useState(null)
  const [showPublicFlow, setShowPublicFlow] = useState(false)
  const [acknowledgedRisk, setAcknowledgedRisk] = useState(false)

  // Check username availability with debounce
  useEffect(() => {
    if (!username.trim()) {
      setIsAvailable(null)
      return
    }

    const checkAvailability = async () => {
      setIsChecking(true)
      try {
        const { data, error } = await supabase
          .from('users')
          .select('username')
          .eq('username', username.trim())

        // Available if empty array or error
        setIsAvailable(!data || data.length === 0)
      } catch (err) {
        setIsAvailable(true) // Available on error (likely doesn't exist)
      }
      setIsChecking(false)
    }

    const timeoutId = setTimeout(checkAvailability, 300)
    return () => clearTimeout(timeoutId)
  }, [username])

  const getPasswordStrength = (pwd) => {
    if (!pwd) return null
    
    const hasLength = pwd.length >= 8
    const hasUpper = /[A-Z]/.test(pwd)
    const hasLower = /[a-z]/.test(pwd)
    const hasNumber = /[0-9]/.test(pwd)
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd)
    
    const score = [hasLength, hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length
    
    if (score <= 2) return 'weak'
    if (score <= 3) return 'okay'
    return 'strong'
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const isPublic = showPublicFlow
    
    if (!username.trim() || (!isPublic && !password.trim()) || !isAvailable) return

    const passwordStrength = getPasswordStrength(password)
    if (!isPublic && passwordStrength === 'weak' && !acknowledgedRisk) {
      setMessage('Error: Please acknowledge the risk of using a weak password')
      return
    }

    setIsSubmitting(true)
    setMessage('')

    try {
      const saltBytes = crypto.getRandomValues(new Uint8Array(16))
      
      // Generate author keypair and encrypt private key with password
      const effectivePassword = isPublic ? username.trim() : password
      const { publicKey, encryptedPrivateKey, salt } = await PublicKeyEncryption.generateAuthorKeys(
        effectivePassword,
        saltBytes
      )
      
      const { data, error } = await supabase
        .from('users')
        .upsert({
          username: username.trim(),
          public_key: publicKey,
          encrypted_private_key: encryptedPrivateKey,
          salt: salt,
          is_public: isPublic
        })

      if (error) {
        setMessage('Error: ' + error.message)
      } else {
        setMessage(`URL created: https://lekh.space/${username.trim()}`)
        // Redirect to the writing page after creation
        setTimeout(() => {
          window.location.href = `/${username.trim()}`
        }, 2000)
        setUsername('')
        setPassword('')
        setShowPublicFlow(false)
        setIsAvailable(null)
        setAcknowledgedRisk(false)
      }
    } catch (err) {
      setMessage('Error creating URL: ' + err.message)
    }

    setIsSubmitting(false)
  }

  const generateRandomUsername = async () => {
    let attempts = 0
    while (attempts < 5) {
      try {
        const response = await fetch('/api/random-username')
        if (!response.ok) {
          throw new Error('API request failed')
        }
        
        const { username: candidate, error } = await response.json()
        
        if (error) {
          throw new Error(error)
        }

        // API already ensures uniqueness, so we can trust the result
        setUsername(candidate)
        setIsAvailable(true)
        return
      } catch (err) {
        // Network/parsing errors - retry
        if (err instanceof TypeError || err.name === 'NetworkError' || err.message === 'API request failed') {
          attempts++
          continue
        }
        // Other errors - break and use fallback
        break
      }
    }

    // Fallback with more uniqueness
    const fallback = `user-${Date.now().toString().slice(-4)}-${Math.random().toString(36).substr(2, 3)}`
    setUsername(fallback)
    setIsAvailable(true)
  }


  return (
    <div className="container">
      {!showPublicFlow ? (
        <>
          <h1>Your private writing space</h1>
          <p>A distraction-free place to write. End-to-end encrypted. No account needed.</p>

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Choose your URL:</label>
              <div className="url-preview">
                https://lekh.space/
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your-name"
                  pattern="[a-zA-Z0-9_\-]+"
                  title="Only letters, numbers, hyphens, and underscores allowed"
                  required
                />
              </div>
              {username && (
                <div className="availability-status">
                  {isChecking ? (
                    <span className="checking">⏳ Checking...</span>
                  ) : isAvailable === true ? (
                    <span className="available">✅ Available</span>
                  ) : isAvailable === false ? (
                    <span className="unavailable">❌ Already taken</span>
                  ) : null}
                </div>
              )}
            </div>

            <div className="input-group">
              <label>Set your password:</label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setAcknowledgedRisk(false) // Reset when password changes
                }}
                placeholder="Enter a password"
                required
              />
              {password && (
                <div className={`password-strength ${getPasswordStrength(password)}`}>
                  {getPasswordStrength(password) === 'weak' && '⚠️ Weak password'}
                  {getPasswordStrength(password) === 'okay' && '✓ Okay password'}
                  {getPasswordStrength(password) === 'strong' && '✓ Strong password'}
                </div>
              )}
              <div className="password-hint">
                If you forget this password, your writing is lost forever. No password reset available.
              </div>
              {password && getPasswordStrength(password) === 'weak' && (
                <div className="risk-acknowledgment">
                  <label>
                    <input
                      type="checkbox"
                      checked={acknowledgedRisk}
                      onChange={(e) => setAcknowledgedRisk(e.target.checked)}
                    />
                    {' '}I understand the risk of using a weak password
                  </label>
                </div>
              )}
            </div>

            <div className="buttons">
              <button type="button" onClick={generateRandomUsername}>
                Generate Random
              </button>
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  !isAvailable ||
                  isChecking ||
                  !password.trim() ||
                  (getPasswordStrength(password) === 'weak' && !acknowledgedRisk)
                }
              >
                {isSubmitting ? 'Creating...' : 'Create my space'}
              </button>
            </div>
          </form>

          {message && (
            <div className={`message ${message.startsWith('Error') ? 'error' : 'success'}`}>
              {message}
            </div>
          )}

          <div className="divider">
            <span>or</span>
          </div>

          <button className="secondary-action" onClick={() => setShowPublicFlow(true)}>
            Create a shared writing space →
          </button>

          <section className="help">
            <h2>What is this?</h2>
            <p>
              A minimal writing space. Your words are private—only you can decrypt them. 
              No account needed, just remember your password.
            </p>
            <p>
              View everything you've written by visiting lekh.space/yourname/all.
            </p>
            <p>
              Questions? Raise an issue at{' '}
              <a href="https://github.com/swappysh/lekh">github.com/swappysh/lekh</a>.
            </p>
          </section>
        </>
      ) : (
        <>
          <h1>Create a shared writing space</h1>
          <p>Anyone with the link can write here. No password needed.</p>

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Choose your URL:</label>
              <div className="url-preview">
                https://lekh.space/
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your-name"
                  pattern="[a-zA-Z0-9_\-]+"
                  title="Only letters, numbers, hyphens, and underscores allowed"
                  required
                />
              </div>
              {username && (
                <div className="availability-status">
                  {isChecking ? (
                    <span className="checking">⏳ Checking...</span>
                  ) : isAvailable === true ? (
                    <span className="available">✅ Available</span>
                  ) : isAvailable === false ? (
                    <span className="unavailable">❌ Already taken</span>
                  ) : null}
                </div>
              )}
            </div>

            <div className="buttons">
              <button type="button" onClick={generateRandomUsername}>
                Generate Random
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !isAvailable || isChecking}
              >
                {isSubmitting ? 'Creating...' : 'Create shared space'}
              </button>
            </div>
          </form>

          {message && (
            <div className={`message ${message.startsWith('Error') ? 'error' : 'success'}`}>
              {message}
            </div>
          )}

          <button className="back-link" onClick={() => {
            setShowPublicFlow(false)
            setUsername('')
            setPassword('')
            setMessage('')
            setIsAvailable(null)
            setIsChecking(false)
          }}>
            ← Back to private space
          </button>

          <section className="help">
            <h2>Collaborative writing</h2>
            <p>
              Multiple people can write simultaneously with real-time updates.
              Perfect for group notes, shared journals, or writing together.
            </p>
          </section>
        </>
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
          padding: 20px;
          font-family: monospace;
          max-width: 600px;
          margin: 0 auto;
        }

        .divider {
          margin: 40px 0 30px 0;
          text-align: center;
          position: relative;
        }

        .divider::before {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          height: 1px;
          background: #ddd;
        }

        .divider span {
          background: #FAFAF7;
          padding: 0 20px;
          position: relative;
          color: #999;
          font-size: 14px;
        }

        .secondary-action {
          width: 100%;
          padding: 16px 24px;
          border: 1px solid #ccc;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          font-family: monospace;
          font-size: 16px;
          text-align: center;
          color: #666;
          transition: all 0.2s;
        }

        .secondary-action:hover {
          background: #f5f5f5;
          color: #333;
        }

        .back-link {
          margin-top: 20px;
          padding: 8px 0;
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          font-family: monospace;
          font-size: 14px;
          text-decoration: underline;
        }

        .back-link:hover {
          color: #333;
        }

        .input-group {
          margin: 20px 0;
        }

        .availability-status {
          margin-top: 8px;
          font-size: 14px;
        }

        .available {
          color: #28a745;
        }

        .unavailable {
          color: #dc3545;
        }

        .checking {
          color: #6c757d;
        }

        label {
          display: block;
          margin-bottom: 10px;
          font-weight: bold;
        }

        .url-preview {
          display: flex;
          align-items: center;
          font-size: 16px;
          border: 1px solid #ccc;
          border-radius: 4px;
          overflow: hidden;
        }

        .url-preview input {
          border: none;
          padding: 12px;
          font-family: monospace;
          font-size: 16px;
          background: transparent;
          flex: 1;
          outline: none;
          color: inherit;
        }

        input[type="password"] {
          width: 100%;
          padding: 12px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-family: monospace;
          font-size: 16px;
          background: white;
          color: inherit;
          box-sizing: border-box;
        }

        input[type="password"]:focus {
          outline: none;
          border-color: #0B57D0;
          box-shadow: 0 0 0 2px rgba(11, 87, 208, 0.1);
        }

        .password-hint {
          margin-top: 8px;
          font-size: 14px;
          color: #6c757d;
        }

        .password-strength {
          margin-top: 8px;
          font-size: 14px;
          font-weight: bold;
        }

        .password-strength.weak {
          color: #dc3545;
        }

        .password-strength.okay {
          color: #ffc107;
        }

        .password-strength.strong {
          color: #28a745;
        }

        .risk-acknowledgment {
          margin-top: 12px;
          padding: 12px;
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 4px;
        }

        .risk-acknowledgment label {
          font-weight: normal;
          margin: 0;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .risk-acknowledgment input[type="checkbox"] {
          margin-top: 3px;
        }

        .buttons {
          display: flex;
          gap: 10px;
          margin: 20px 0;
        }

        button {
          padding: 12px 24px;
          border: 1px solid #ccc;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          font-family: monospace;
        }

        button:hover:not(:disabled) {
          background: #f5f5f5;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .message {
          padding: 12px;
          border-radius: 4px;
          margin: 20px 0;
        }

        .message.success {
          background: #d4edda;
          border: 1px solid #c3e6cb;
          color: #155724;
        }

        .message.error {
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          color: #721c24;
        }

        .help {
          margin-top: 40px;
        }

        .help h2 {
          margin-bottom: 10px;
        }

        .help p {
          margin: 0 0 10px 0;
        }

        @media (prefers-color-scheme: dark) {
          .url-preview {
            border-color: #555;
          }
          
          button {
            background: #333;
            border-color: #555;
            color: white;
          }
          
          button:hover:not(:disabled) {
            background: #444;
          }
          
          .message.success {
            background: #155724;
            border-color: #0f4419;
            color: #d4edda;
          }
          
          .message.error {
            background: #721c24;
            border-color: #5a1a1f;
            color: #f8d7da;
          }

          .available {
            color: #40d865;
          }

          .unavailable {
            color: #ff6b6b;
          }

          .checking {
            color: #adb5bd;
          }

          input[type="password"] {
            background: #333;
            border-color: #555;
            color: white;
          }

          input[type="password"]:focus {
            border-color: #8AB4F8;
            box-shadow: 0 0 0 2px rgba(138, 180, 248, 0.1);
          }

        .password-hint {
          color: #adb5bd;
        }

        .password-strength.weak {
          color: #ff6b6b;
        }

        .password-strength.okay {
          color: #ffd93d;
        }

        .password-strength.strong {
          color: #40d865;
        }

        .risk-acknowledgment {
          background: #3a3a2a;
          border-color: #ffd93d;
        }

        .divider::before {
          background: #555;
        }

        .divider span {
          background: #0B0B0C;
        }

        .secondary-action {
          background: #333;
          border-color: #555;
          color: #999;
        }

        .secondary-action:hover {
          background: #444;
          color: #ededed;
        }

        .back-link {
          color: #999;
        }

        .back-link:hover {
          color: #ededed;
        }
      }
      `}</style>
    </div>
  )
}
