import { useRef, useEffect } from 'react'

export default function Editor({ content, setContent }) {
  const editorRef = useRef(null)

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.style.height = 'auto'
      editorRef.current.style.height = editorRef.current.scrollHeight + 'px'
    }
  }, [content])

  return (
    <>
      <textarea
        ref={editorRef}
        className="editor"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Start writing..."
      />
      <style jsx>{`
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
      `}</style>
    </>
  )
}
