import { useEffect, useState } from 'react'
import { PublicKeyEncryption } from '../lib/publicKeyEncryption'
import { supabase } from '../lib/supabase'
import { DEBOUNCE_DELAY, JSON_CONTENT_TYPE_HEADER } from '../lib/constants'

export default function Home() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [isAvailable, setIsAvailable] = useState(null)
  const [availabilityError, setAvailabilityError] = useState(false)
  const [showPublicFlow, setShowPublicFlow] = useState(false)
  const [acknowledgedRisk, setAcknowledgedRisk] = useState(false)
  const [isGeneratingUsername, setIsGeneratingUsername] = useState(false)
  const [submissionStage, setSubmissionStage] = useState(null) // 'encrypting' | 'checking' | 'creating' | 'success' | null
  const [checkingTakingLong, setCheckingTakingLong] = useState(false)

  // Check username availability with debounce and timeout fallback
  useEffect(() => {
    if (!username.trim()) {
      setIsAvailable(null)
      setAvailabilityError(false)
      setCheckingTakingLong(false)
      return
    }

    const checkAvailability = async () => {
      setIsChecking(true)
      setCheckingTakingLong(false)
      let completed = false

      // Set timeout to show "taking longer than expected" message after 5 seconds
      const timeoutWarningId = setTimeout(() => {
        if (!completed) {
          setCheckingTakingLong(true)
        }
      }, 5000)

      try {
        const { data, error } = await supabase
          .from('users')
          .select('username')
          .eq('username', username.trim())

        completed = true
        clearTimeout(timeoutWarningId)
        if (error) {
          setIsAvailable(null)
          setAvailabilityError(true)
        } else {
          setIsAvailable(!data || data.length === 0)
          setAvailabilityError(false)
        }
        setCheckingTakingLong(false)
      } catch (err) {
        completed = true
        clearTimeout(timeoutWarningId)
        setIsAvailable(null)
        setAvailabilityError(true)
        setCheckingTakingLong(false)
      }
      setIsChecking(false)
    }

    const timeoutId = setTimeout(checkAvailability, DEBOUNCE_DELAY)
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
    setSubmissionStage('encrypting')
    setMessage('')

    try {
      const saltBytes = crypto.getRandomValues(new Uint8Array(16))

      const effectivePassword = isPublic ? username.trim() : password
      setSubmissionStage('checking')
      const { publicKey, encryptedPrivateKey, salt } = await PublicKeyEncryption.generateAuthorKeys(
        effectivePassword,
        saltBytes
      )

      setSubmissionStage('creating')
      const response = await fetch('/api/create-user', {
        method: 'POST',
        headers: JSON_CONTENT_TYPE_HEADER,
        body: JSON.stringify({
          username: username.trim(),
          publicKey,
          encryptedPrivateKey,
          salt,
          isPublic,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        setIsSubmitting(false)
        setSubmissionStage(null)
        const errorMap = {
          'Username already taken': 'This username is taken. Try another one.',
          'Invalid username': 'Username can only contain letters, numbers, hyphens, and underscores.',
          'Failed to verify username availability': 'Unable to check availability. Please try again.',
          'Missing required fields': 'Something went wrong. Please try again.',
          'Invalid isPublic value': 'Something went wrong. Please try again.',
          'Failed to create user': 'Unable to create your space. Please try again.',
          'Internal server error': 'Our server had an issue. Please try again in a moment.',
        }
        const friendlyError = errorMap[payload?.error] || 'Unable to create your space. Please try again.'
        setMessage(`Error: ${friendlyError}`)
      } else {
        setSubmissionStage('success')
        const createdUsername = payload?.username || username.trim()
        setMessage(`your space is ready → lekh.space/${createdUsername}`)
        setTimeout(() => {
          window.location.href = `/${createdUsername}`
        }, 2000)
        setUsername('')
        setPassword('')
        setShowPublicFlow(false)
        setIsAvailable(null)
        setAvailabilityError(false)
        setAcknowledgedRisk(false)
        setIsSubmitting(false)
        setSubmissionStage(null)
      }
    } catch (err) {
      setIsSubmitting(false)
      setSubmissionStage(null)
      setMessage('Error: Unable to reach the server. Please check your connection and try again.')
    }
  }

  const generateRandomUsername = async () => {
    setIsGeneratingUsername(true)
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

        setUsername(candidate)
        setIsAvailable(true)
        setAvailabilityError(false)
        setIsGeneratingUsername(false)
        return
      } catch (err) {
        if (err instanceof TypeError || err.name === 'NetworkError' || err.message === 'API request failed') {
          attempts++
          continue
        }
        break
      }
    }

    const fallback = `user-${Date.now().toString().slice(-4)}-${Math.random().toString(36).substr(2, 3)}`
    setUsername(fallback)
    setIsAvailable(true)
    setAvailabilityError(false)
    setIsGeneratingUsername(false)
  }


  return (
    <div className="container">
      {!showPublicFlow ? (
        <>
          <h1>lekh.space/[username]</h1>
          <p>Write freely. Everything is encrypted and stays private — only you can read it.</p>
          <p>Your password is the key. Keep it safe — there's no recovery if you forget it.</p>

          <div className="demo-cta">
            <button
              type="button"
              className="demo-button"
              onClick={() => window.location.href = '/demo'}
            >
              See example space →
            </button>
          </div>

          <div className="divider">
            <span>or create your own</span>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>lekh.space/</label>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (message.startsWith('Error')) setMessage('')
                }}
                placeholder="[username]"
                pattern="[a-zA-Z0-9_\-]+"
                title="Only letters, numbers, hyphens, and underscores allowed"
                required
                className="username-input"
              />
              {username && (
                <div className="availability-indicator" aria-live="polite" aria-atomic="true">
                  {isChecking ? (
                    <span className="checking">
                      <span className="spinner"></span>
                      {checkingTakingLong ? 'checking... (taking longer than expected)' : 'checking...'}
                    </span>
                  ) : availabilityError ? (
                    <span className="checking">unable to verify</span>
                  ) : isAvailable === true ? (
                    <span className="available">✓ available</span>
                  ) : isAvailable === false ? (
                    <span className="unavailable">✗ taken</span>
                  ) : null}
                </div>
              )}
            </div>

            <div className="input-group">
              <label>Choose a password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setAcknowledgedRisk(false) // Reset when password changes
                  if (message.startsWith('Error')) setMessage('')
                }}
                placeholder="at least 8 characters"
                required
              />
              {password && (
                <div className={`password-strength ${getPasswordStrength(password)}`}>
                  {getPasswordStrength(password) === 'weak' && '⚠ weak'}
                  {getPasswordStrength(password) === 'okay' && '○ okay'}
                  {getPasswordStrength(password) === 'strong' && '✓ strong'}
                </div>
              )}
              {password && (
                <div className="password-hint">
                  There's no recovery if you forget this. We can't reset it for you.
                </div>
              )}
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
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  !isAvailable ||
                  isChecking ||
                  !password.trim() ||
                  (getPasswordStrength(password) === 'weak' && !acknowledgedRisk)
                }
                className="create-button"
              >
                {isSubmitting ? (
                  <>
                    <span className="progress-indicator"></span>
                    {submissionStage === 'encrypting' && 'Encrypting...'}
                    {submissionStage === 'checking' && 'Checking...'}
                    {submissionStage === 'creating' && 'Creating...'}
                    {submissionStage === 'success' && '✓ Success'}
                  </>
                ) : (
                  'Create my space'
                )}
              </button>
            </div>
          </form>

          {message && (
            <div className={`message ${message.startsWith('Error') ? 'error' : 'success'}`} role="alert">
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
              A private space for your writing—journals, notes, thoughts.
            </p>
            <p>
              Everything is encrypted end-to-end. Only you can read it. Not us,
              not anyone else. Ever.
            </p>
            <p>
              No email required. Just pick a username and password.
            </p>
            <p>
              View all your entries at lekh.space/yourname/all
            </p>
            <p>
              Questions? Open an issue on{' '}
              <a href="https://github.com/swappysh/lekh">GitHub</a>.
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
                  onChange={(e) => {
                    setUsername(e.target.value)
                    if (message.startsWith('Error')) setMessage('')
                  }}
                  placeholder="your-name"
                  pattern="[a-zA-Z0-9_\-]+"
                  title="Only letters, numbers, hyphens, and underscores allowed"
                  required
                />
              </div>
              {username && (
                <div className="availability-indicator" aria-live="polite" aria-atomic="true">
                  {isChecking ? (
                    <span className="checking">
                      <span className="spinner"></span>
                      {checkingTakingLong ? 'checking... (taking longer than expected)' : 'checking...'}
                    </span>
                  ) : availabilityError ? (
                    <span className="checking">unable to verify</span>
                  ) : isAvailable === true ? (
                    <span className="available">✓ available</span>
                  ) : isAvailable === false ? (
                    <span className="unavailable">✗ taken</span>
                  ) : null}
                </div>
              )}
            </div>

            <div className="buttons">
              <button type="button" onClick={generateRandomUsername} disabled={isGeneratingUsername}>
                {isGeneratingUsername ? (
                  <>
                    <span className="button-spinner"></span>Generating...
                  </>
                ) : (
                  'Suggest a name'
                )}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !isAvailable || isChecking}
              >
                {isSubmitting ? (
                  <>
                    <span className="button-spinner"></span>Creating
                  </>
                ) : (
                  'Create shared space'
                )}
              </button>
            </div>
          </form>

          {message && (
            <div className={`message ${message.startsWith('Error') ? 'error' : 'success'}`} role="alert">
              {message}
            </div>
          )}

          <button className="back-link" onClick={() => {
            setShowPublicFlow(false)
            setUsername('')
            setPassword('')
            setMessage('')
            setIsAvailable(null)
            setAvailabilityError(false)
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
        @keyframes spinner-rotate {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes spinner-pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }

        @keyframes dots-pulse {
          0%, 100% {
            opacity: 0.4;
          }
          50% {
            opacity: 1;
          }
        }

        @keyframes pulse-bg {
          0%, 100% {
            background-color: rgba(220, 53, 69, 0.1);
          }
          50% {
            background-color: rgba(220, 53, 69, 0.2);
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes button-pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.85;
          }
        }

        /* Reduced motion support - Phase 6 accessibility */
        @media (prefers-reduced-motion: reduce) {
          .spinner,
          .button-spinner,
          .progress-indicator {
            animation: none;
            opacity: 1;
          }
        }

        .spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 3px solid var(--color-gray);
          border-top-color: var(--color-accent);
          border-radius: 50%;
          animation: spinner-rotate 0.8s linear infinite;
          margin-right: 6px;
          vertical-align: -3px;
        }

        .button-spinner {
          display: inline-block;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: currentColor;
          box-shadow:
            8px 0 0 -2px currentColor,
            16px 0 0 -2px currentColor;
          animation: dots-pulse 0.6s ease-in-out infinite;
          margin-right: 8px;
          vertical-align: -1px;
        }

        .progress-indicator {
          display: inline-block;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: currentColor;
          box-shadow:
            8px 0 0 -2px currentColor,
            16px 0 0 -2px currentColor;
          animation: dots-pulse 0.6s ease-in-out infinite;
          margin-right: 8px;
          vertical-align: -1px;
        }

        .container {
          padding: 20px;
          font-family: var(--font-mono);
          max-width: 600px;
          margin: 0 auto;
        }

        .demo-cta {
          margin: 32px 0 24px 0;
        }

        .demo-button {
          width: 100%;
          padding: 16px 24px;
          border: 2px solid var(--color-accent);
          border-radius: 4px;
          background: var(--color-accent);
          color: white;
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 16px;
          font-weight: bold;
          text-align: center;
          transition: all 0.2s;
          min-height: 48px;
        }

        .demo-button:hover {
          background: var(--color-accent-dark);
          border-color: var(--color-accent-dark);
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(var(--color-accent-rgb), 0.3);
        }

        .demo-button:active {
          transform: translateY(0);
        }

        .divider {
          margin: 48px 0 36px 0;
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
          background: var(--color-border-light);
        }

        .divider span {
          background: var(--color-bg);
          padding: 0 20px;
          position: relative;
          color: var(--color-gray);
          font-size: 14px;
        }

        .secondary-action {
          width: 100%;
          padding: 16px 24px;
          border: 1px solid var(--color-border);
          border-radius: 4px;
          background: transparent;
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 16px;
          text-align: center;
          color: var(--color-gray-darker);
          transition: all 0.2s;
        }

        .secondary-action:hover {
          background: var(--color-gray-light);
          color: var(--color-gray-text);
          border-color: var(--color-gray);
        }

        .back-link {
          margin-top: 20px;
          padding: 8px 0;
          background: none;
          border: none;
          color: var(--color-gray-darker);
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 14px;
          text-decoration: underline;
        }

        .back-link:hover {
          color: var(--color-gray-text);
        }

        .input-group {
          margin: 24px 0;
        }

        .availability-indicator {
          margin-top: 8px;
          font-size: 13px;
          padding: 8px 12px;
          padding-left: 8px;
          border-left: 4px solid transparent;
          min-height: 44px;
          display: flex;
          align-items: center;
          font-family: var(--font-mono);
        }

        .availability-indicator .checking {
          display: flex;
          align-items: center;
          color: var(--color-accent);
          border-left-color: var(--color-accent);
          animation: spinner-pulse 0.8s ease-in-out infinite;
          min-height: 44px;
          padding: 12px 0;
        }

        .availability-indicator .available {
          color: var(--color-success);
          border-left-color: var(--color-success);
          min-height: 44px;
          padding: 12px 0;
          display: flex;
          align-items: center;
        }

        .availability-indicator .unavailable {
          color: var(--color-error);
          border-left-color: var(--color-error);
          min-height: 44px;
          padding: 12px 0;
          display: flex;
          align-items: center;
        }

        /* Reduced motion: disable animations for checking indicator */
        @media (prefers-reduced-motion: reduce) {
          .availability-indicator .checking {
            animation: none;
            opacity: 1;
            color: var(--color-text);
          }
        }

        .availability-status {
          margin-top: 8px;
          font-size: 14px;
        }

        .available {
          color: var(--color-success);
        }

        .unavailable {
          color: var(--color-error);
        }

        .checking {
          color: var(--color-gray);
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
          border: 1px solid var(--color-border);
          border-radius: 4px;
          overflow: hidden;
          min-height: 48px;
        }

        .username-input {
          width: 100%;
          padding: 14px 12px;
          border: 1px solid var(--color-border);
          border-radius: 4px;
          font-family: var(--font-mono);
          font-size: 16px;
          background: white;
          color: inherit;
          box-sizing: border-box;
          min-height: 48px;
        }

        .username-input:focus {
          outline: none;
          border-color: var(--color-accent);
          border-width: 2px;
          padding: 13px 11px;
          box-shadow: 0 0 0 2px rgba(var(--color-accent-rgb), 0.1);
          transition: all 0.2s;
        }

        .url-preview input {
          border: none;
          padding: 12px;
          font-family: var(--font-mono);
          font-size: 16px;
          background: transparent;
          flex: 1;
          outline: none;
          color: inherit;
        }

        .create-button {
          background: var(--color-text) !important;
          color: white !important;
          border: none !important;
          padding: 14px 32px;
          border-radius: 4px;
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 18px;
          font-weight: bold;
          min-height: 48px;
          transition: all 0.2s;
        }

        .create-button:hover:not(:disabled) {
          background: #000000 !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }

        .create-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .create-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        input[type="password"] {
          width: 100%;
          padding: 14px 12px;
          border: 1px solid var(--color-border);
          border-radius: 4px;
          font-family: var(--font-mono);
          font-size: 16px;
          background: white;
          color: inherit;
          box-sizing: border-box;
          min-height: 48px;
        }

        input[type="password"]:focus {
          outline: none;
          border-color: var(--color-accent);
          border-width: 2px;
          padding: 13px 11px;
          box-shadow: 0 0 0 2px rgba(var(--color-accent-rgb), 0.1);
          transition: all 0.2s;
        }

        .password-hint {
          margin-top: 8px;
          font-size: 13px;
          color: var(--color-gray);
          line-height: 1.4;
        }

        .password-strength {
          margin-top: 8px;
          font-size: 14px;
          font-weight: bold;
        }

        .password-strength.weak {
          color: var(--color-error);
        }

        .password-strength.okay {
          color: var(--color-warning);
        }

        .password-strength.strong {
          color: var(--color-success);
        }

        .risk-acknowledgment {
          margin-top: 12px;
          padding: 12px;
          background: var(--color-warning-bg);
          border: 1px solid var(--color-warning-border);
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
          border: 1px solid var(--color-border);
          border-radius: 4px;
          background: white;
          cursor: pointer;
          font-family: var(--font-mono);
        }

        button:hover:not(:disabled) {
          background: var(--color-gray-light);
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
          background: var(--color-success-bg);
          border: 1px solid var(--color-success-border);
          color: var(--color-success-text);
        }

        .message.error {
          background: var(--color-error-bg);
          border: 1px solid var(--color-error-border);
          color: var(--color-error-text);
        }

        .help {
          margin-top: 40px;
        }

        .help h2 {
          margin-bottom: 10px;
        }

        .help p {
          margin: 0 0 10px 0;
          color: var(--color-gray-darkest);
          line-height: 1.6;
        }

        @media (prefers-color-scheme: dark) {
          .url-preview {
            border-color: var(--color-border);
          }

          button {
            background: var(--color-surface-darkest);
            border-color: var(--color-border);
            color: white;
          }

          button:hover:not(:disabled) {
            background: var(--color-surface-darker);
          }

          .message.success {
            background: var(--color-success-bg);
            border-color: var(--color-success-border);
            color: var(--color-success-text);
          }

          .message.error {
            background: var(--color-error-bg);
            border-color: var(--color-error-border);
            color: var(--color-error-text);
          }

          .available {
            color: var(--color-success);
          }

          .unavailable {
            color: var(--color-error);
          }

          .checking {
            color: var(--color-gray-dark);
          }

          input[type="password"] {
            background: var(--color-surface-dark);
            border-color: var(--color-gray-text-alt);
            color: white;
          }

          input[type="password"]:focus {
            border-color: var(--color-accent);
            border-width: 2px;
            padding: 13px 11px;
            box-shadow: 0 0 0 2px rgba(var(--color-accent-rgb), 0.1);
          }

          .username-input {
            background: var(--color-surface-dark);
            border-color: var(--color-gray-text-alt);
            color: white;
          }

          .username-input:focus {
            border-color: var(--color-accent);
            border-width: 2px;
            padding: 13px 11px;
            box-shadow: 0 0 0 2px rgba(var(--color-accent-rgb), 0.1);
          }

          .create-button {
            background: #000000 !important;
            color: #ffffff !important;
            border: 2px solid #ffffff !important;
          }

          .create-button:hover:not(:disabled) {
            background: #222222 !important;
            border-color: #ffffff !important;
          }

          .help p {
            color: var(--color-gray-text);
          }

        .password-hint {
          color: var(--color-gray-dark);
        }

        .password-strength.weak {
          color: var(--color-error);
        }

        .password-strength.okay {
          color: var(--color-warning);
        }

        .password-strength.strong {
          color: var(--color-success);
        }

        .risk-acknowledgment {
          background: var(--color-warning-bg);
          border-color: var(--color-warning-border);
        }

        .divider::before {
          background: var(--color-border);
        }

        .divider span {
          background: var(--color-bg);
        }

          .secondary-action {
            background: transparent;
            border-color: var(--color-border);
            color: var(--color-gray);
          }

          .secondary-action:hover {
            background: var(--color-surface-darker);
            color: var(--color-text);
            border-color: var(--color-gray-dark);
          }

        .back-link {
          color: var(--color-gray);
        }

        .back-link:hover {
          color: var(--color-text);
        }

        .demo-button {
          background: var(--color-accent);
          border-color: var(--color-accent);
          color: var(--color-bg);
        }

        .demo-button:hover {
          background: var(--color-accent-light);
          border-color: var(--color-accent-light);
          box-shadow: 0 4px 8px rgba(var(--color-accent-rgb), 0.3);
        }
      }
      `}</style>
    </div>
  )
}
