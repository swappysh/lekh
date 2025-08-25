import { useRef, useEffect, forwardRef } from 'react'
import { marked } from 'marked'

const Editor = forwardRef(function Editor({ content, setContent }, ref) {
  const internalRef = useRef(null)
  const editorRef = ref || internalRef
  const overlayRef = useRef(null)

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.style.height = 'auto'
      editorRef.current.style.height = editorRef.current.scrollHeight + 'px'
      
      if (overlayRef.current) {
        overlayRef.current.style.height = editorRef.current.style.height
      }
    }
  }, [content])

  const renderMarkdown = () => {
    return { __html: marked(content) }
  }

  return (
    <>
      <div className="editor-container">
        <textarea
          ref={editorRef}
          className="editor"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start writing..."
        />
        <div 
          ref={overlayRef}
          className="markdown-overlay" 
          dangerouslySetInnerHTML={renderMarkdown()}
        />
      </div>
      <style jsx>{`
        .editor-container {
          position: relative;
          width: 100%;
          min-height: 100vh;
        }
        
        .editor {
          position: absolute;
          top: 0;
          left: 0;
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
          color: transparent;
          caret-color: #333;
          overflow: hidden;
          box-sizing: border-box;
          z-index: 2;
          -webkit-text-fill-color: transparent;
        }
        
        .markdown-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          min-height: 100vh;
          padding: 10px;
          font-size: 18px;
          line-height: 1.6;
          font-family: monospace;
          box-sizing: border-box;
          pointer-events: none;
          z-index: 1;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        
        .markdown-overlay :global(h1) {
          font-size: 2em;
          margin: 0.5em 0;
          font-weight: bold;
        }
        
        .markdown-overlay :global(h2) {
          font-size: 1.5em;
          margin: 0.5em 0;
          font-weight: bold;
        }
        
        .markdown-overlay :global(h3) {
          font-size: 1.2em;
          margin: 0.5em 0;
          font-weight: bold;
        }
        
        .markdown-overlay :global(p) {
          margin: 1em 0;
        }
        
        .markdown-overlay :global(strong) {
          font-weight: bold;
        }
        
        .markdown-overlay :global(em) {
          font-style: italic;
        }
        
        .markdown-overlay :global(code) {
          background: #f4f4f4;
          padding: 2px 4px;
          border-radius: 3px;
          font-family: monospace;
        }
        
        .markdown-overlay :global(pre) {
          background: #f4f4f4;
          padding: 1em;
          border-radius: 4px;
          overflow-x: auto;
          font-family: monospace;
        }
        
        .markdown-overlay :global(blockquote) {
          border-left: 4px solid #ddd;
          margin: 1em 0;
          padding-left: 1em;
          color: #666;
        }
        
        .markdown-overlay :global(ul), .markdown-overlay :global(ol) {
          padding-left: 2em;
        }
        
        .markdown-overlay :global(a) {
          color: #0066cc;
          text-decoration: underline;
        }
      `}</style>
    </>
  )
})

export default Editor
