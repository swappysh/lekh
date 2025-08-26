import { useRef, useEffect, forwardRef, useState } from 'react'

const CollaborativeEditor = forwardRef(function CollaborativeEditor({ 
  content, 
  onContentChange, 
  onCursorChange,
  activeEditors = [],
  isCollaborative = false 
}, ref) {
  const internalRef = useRef(null)
  const editorRef = ref || internalRef
  const [isUpdating, setIsUpdating] = useState(false)

  // Auto-resize textarea
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.style.height = 'auto'
      editorRef.current.style.height = editorRef.current.scrollHeight + 'px'
    }
  }, [content])

  // Update editor content when it changes externally (from collaborative edits)
  useEffect(() => {
    if (editorRef.current && editorRef.current.value !== content) {
      const cursorPos = editorRef.current.selectionStart
      setIsUpdating(true)
      editorRef.current.value = content
      
      // Restore cursor position after update
      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.selectionStart = cursorPos
          editorRef.current.selectionEnd = cursorPos
        }
        setIsUpdating(false)
      })
    }
  }, [content])

  const handleChange = (e) => {
    if (!isUpdating && onContentChange) {
      const newValue = e.target.value
      const cursorPosition = e.target.selectionStart
      onContentChange(newValue, cursorPosition)
    }
  }

  const handleSelectionChange = () => {
    if (editorRef.current && onCursorChange && !isUpdating) {
      onCursorChange(editorRef.current.selectionStart)
    }
  }

  // Generate cursor position styles for other editors
  const getCursorStyles = () => {
    if (!isCollaborative || !editorRef.current || activeEditors.length === 0) {
      return []
    }

    return activeEditors.map((editor, index) => {
      const position = editor.cursor_position || 0
      
      // Calculate approximate line and column from cursor position
      const textBeforeCursor = content.substring(0, position)
      const lines = textBeforeCursor.split('\n')
      const lineNumber = lines.length - 1
      const columnNumber = lines[lines.length - 1].length
      
      // Approximate positioning (this is simplified - real implementation would be more accurate)
      const lineHeight = 28.8 // 18px * 1.6 line-height
      const charWidth = 10.8  // Approximate monospace character width
      
      return {
        id: editor.client_id,
        top: lineNumber * lineHeight + 10, // +10 for padding
        left: columnNumber * charWidth + 10,
        color: `hsl(${(index * 137.5) % 360}, 70%, 50%)` // Generate distinct colors
      }
    })
  }

  return (
    <div className="collaborative-editor-container">
      <textarea
        ref={editorRef}
        className="editor"
        value={content}
        onChange={handleChange}
        onKeyUp={handleSelectionChange}
        onMouseUp={handleSelectionChange}
        placeholder="Start writing..."
        spellCheck={false}
      />
      
      {/* Render other users' cursors */}
      {isCollaborative && getCursorStyles().map(cursor => (
        <div
          key={cursor.id}
          className="cursor-indicator"
          style={{
            position: 'absolute',
            top: `${cursor.top}px`,
            left: `${cursor.left}px`,
            backgroundColor: cursor.color,
            width: '2px',
            height: '20px',
            zIndex: 10,
            pointerEvents: 'none',
            animation: 'blink 1s infinite'
          }}
        />
      ))}

      {/* Active editors indicator */}
      {isCollaborative && activeEditors.length > 0 && (
        <div className="active-editors-indicator">
          <span className="active-count">{activeEditors.length}</span> other editor{activeEditors.length !== 1 ? 's' : ''} online
        </div>
      )}

      <style jsx>{`
        .collaborative-editor-container {
          position: relative;
          width: 100%;
        }
        
        .editor {
          width: 100%;
          min-height: 100vh;
          padding: 10px;
          font-size: 18px;
          line-height: 1.6;
          font-family: monospace;
          border: none;
          outline: none;
          resize: none;
          background: transparent;
          color: inherit;
          overflow: hidden;
          box-sizing: border-box;
        }

        .active-editors-indicator {
          position: fixed;
          top: 20px;
          right: 20px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 8px 12px;
          border-radius: 16px;
          font-size: 12px;
          font-family: monospace;
          z-index: 100;
        }

        .active-count {
          font-weight: bold;
          color: #4CAF50;
        }

        @media (prefers-color-scheme: dark) {
          .active-editors-indicator {
            background: rgba(255, 255, 255, 0.1);
            color: #EDEDED;
          }
        }

        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }

        .cursor-indicator::after {
          content: '';
          position: absolute;
          top: -3px;
          left: -3px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: inherit;
        }
      `}</style>
    </div>
  )
})

export default CollaborativeEditor