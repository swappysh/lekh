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

  const validatePassword = (pwd) => {
    return pwd.length >= 12 && 
           /[A-Z]/.test(pwd) && 
           /[a-z]/.test(pwd) && 
           /[0-9]/.test(pwd)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password.trim() || !isAvailable) return

    if (!validatePassword(password)) {
      setMessage('Error: Password must be at least 12 characters with uppercase, lowercase, and numbers')
      return
    }

    setIsSubmitting(true)
    setMessage('')

    try {
      const saltBytes = crypto.getRandomValues(new Uint8Array(16))
      
      // Generate author keypair and encrypt private key with password
      const { publicKey, encryptedPrivateKey, salt } = await PublicKeyEncryption.generateAuthorKeys(
        password, 
        saltBytes
      )
      
      const { data, error } = await supabase
        .from('users')
        .upsert({
          username: username.trim(),
          public_key: publicKey,
          encrypted_private_key: encryptedPrivateKey,
          salt: salt
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
        setIsAvailable(null)
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
        const { username: candidate } = await response.json()

        const { data, error } = await supabase
          .from('users')
          .select('username')
          .eq('username', candidate)

        if (!error && (!data || data.length === 0)) {
          setUsername(candidate)
          setIsAvailable(true)
          return
        }
      } catch (err) {
        // ignore and retry
      }

      attempts++
    }

    const fallback = `user-${Date.now().toString().slice(-4)}`
    setUsername(fallback)
    setIsAvailable(true)
  }


  return (
    <div className="container">
      <h1>Create Your Writing URL</h1>
      <p>Create a personalized URL where you can write and save your content.</p>

      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label>Choose your URL:</label>
          <div className="url-preview">
            https://lekh.space/
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your-username"
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
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter a secure password (min 12 chars)"
            required
            minLength="12"
            pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$"
            title="Password must be at least 12 characters with uppercase, lowercase, and numbers"
          />
          <div className="password-hint">
            Password must be at least 12 characters with uppercase, lowercase, and numbers. Required to encrypt/decrypt your content.
          </div>
        </div>

        <div className="buttons">
          <button type="button" onClick={generateRandomUsername}>
            Generate Random
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !isAvailable || isChecking || !password.trim() || !validatePassword(password)}
          >
            {isSubmitting ? 'Creating...' : 'Create URL'}
          </button>
        </div>
      </form>

      {message && (
        <div className={`message ${message.startsWith('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <section className="help">
        <h2>What is this?</h2>
        <p>
          This is a place to write without interruptions. Write-only philosophy: once you write something, you can't edit it.
          No authentication—just open your link anywhere and start writing.
        </p>
        <p>
          All writes are public and encrypted. You can also write to someone else by visiting their URL.
          Reading isn't the focus, but you can view everything you've written by
          visiting https://lekh.space/username/all.
        </p>
        <p>
          Have feedback or found a bug? Raise an issue at{' '}
          <a href="https://github.com/swappysh/lekh">github.com/swappysh/lekh</a>.
        </p>
      </section>

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
        }
      `}</style>
    </div>
  )
}
