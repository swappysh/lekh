import { useState, useEffect, useRef } from 'react'

export default function PasswordModal({ isOpen, onSubmit, onClose, title = "Enter Password" }) {
  const [password, setPassword] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (password.trim()) {
      onSubmit(password)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-content">
        <h2>{title}</h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter password to decrypt entries..."
            className="password-input"
          />
          <div className="modal-buttons">
            <button type="submit" disabled={!password.trim()}>
              Decrypt
            </button>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
      
      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1000;
        }
        .modal-content {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: #FAFAF7;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
          z-index: 1001;
          min-width: 400px;
          font-family: monospace;
        }
        .modal-content h2 {
          margin: 0 0 20px 0;
          font-size: 18px;
        }
        .password-input {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-family: monospace;
          font-size: 16px;
          margin-bottom: 20px;
          box-sizing: border-box;
        }
        .password-input:focus {
          outline: none;
          border-color: #0B57D0;
        }
        .modal-buttons {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        .modal-buttons button {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          font-family: monospace;
          cursor: pointer;
          font-size: 14px;
        }
        .modal-buttons button[type="submit"] {
          background: #0B57D0;
          color: white;
        }
        .modal-buttons button[type="submit"]:hover:not(:disabled) {
          background: #0842A0;
        }
        .modal-buttons button[type="submit"]:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .modal-buttons button[type="button"] {
          background: #f0f0f0;
          color: #333;
        }
        .modal-buttons button[type="button"]:hover {
          background: #e0e0e0;
        }
        @media (prefers-color-scheme: dark) {
          .modal-content {
            background: #1a1a1a;
            color: #EDEDED;
          }
          .password-input {
            background: #2a2a2a;
            border-color: #444;
            color: #EDEDED;
          }
          .password-input:focus {
            border-color: #8AB4F8;
          }
          .modal-buttons button[type="submit"] {
            background: #8AB4F8;
            color: #0B0B0C;
          }
          .modal-buttons button[type="submit"]:hover:not(:disabled) {
            background: #A8C7FA;
          }
          .modal-buttons button[type="button"] {
            background: #333;
            color: #EDEDED;
          }
          .modal-buttons button[type="button"]:hover {
            background: #444;
          }
        }
      `}</style>
    </>
  )
}