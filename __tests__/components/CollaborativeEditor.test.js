import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollaborativeEditor from '../../components/CollaborativeEditor'

describe('CollaborativeEditor', () => {
  const defaultProps = {
    content: '',
    onContentChange: jest.fn(),
    onCursorChange: jest.fn(),
    activeEditors: [],
    isCollaborative: false
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders editor with placeholder text', () => {
    render(<CollaborativeEditor {...defaultProps} />)
    
    expect(screen.getByPlaceholderText('Start writing...')).toBeInTheDocument()
  })

  test('displays content correctly', () => {
    render(<CollaborativeEditor {...defaultProps} content="Hello world" />)
    
    const editor = screen.getByDisplayValue('Hello world')
    expect(editor).toBeInTheDocument()
  })

  test('calls onContentChange when typing', async () => {
    const onContentChange = jest.fn()
    const user = userEvent.setup()
    
    render(<CollaborativeEditor {...defaultProps} onContentChange={onContentChange} />)
    
    const editor = screen.getByPlaceholderText('Start writing...')
    await user.type(editor, 'Hello')
    
    expect(onContentChange).toHaveBeenCalledWith('Hello', 5)
  })

  test('calls onCursorChange when cursor moves', async () => {
    const onCursorChange = jest.fn()
    
    render(<CollaborativeEditor 
      {...defaultProps} 
      content="Hello world"
      onCursorChange={onCursorChange} 
    />)
    
    const editor = screen.getByDisplayValue('Hello world')
    
    // Simulate cursor movement
    fireEvent.keyUp(editor, { key: 'ArrowRight' })
    
    expect(onCursorChange).toHaveBeenCalled()
  })

  test('calls onCursorChange on mouse clicks', async () => {
    const onCursorChange = jest.fn()
    
    render(<CollaborativeEditor 
      {...defaultProps} 
      content="Hello world"
      onCursorChange={onCursorChange} 
    />)
    
    const editor = screen.getByDisplayValue('Hello world')
    
    // Simulate mouse click
    fireEvent.mouseUp(editor)
    
    expect(onCursorChange).toHaveBeenCalled()
  })

  test('updates content from external changes', async () => {
    const { rerender } = render(<CollaborativeEditor {...defaultProps} content="Initial" />)
    
    expect(screen.getByDisplayValue('Initial')).toBeInTheDocument()
    
    rerender(<CollaborativeEditor {...defaultProps} content="Updated content" />)
    
    await waitFor(() => {
      expect(screen.getByDisplayValue('Updated content')).toBeInTheDocument()
    })
  })

  test('shows active editors indicator when collaborative', () => {
    const activeEditors = [
      { client_id: 'client1', cursor_position: 5 },
      { client_id: 'client2', cursor_position: 10 }
    ]
    
    render(<CollaborativeEditor 
      {...defaultProps} 
      isCollaborative={true}
      activeEditors={activeEditors}
    />)
    
    expect(screen.getByText('2 other editors online')).toBeInTheDocument()
  })

  test('shows singular form for one editor', () => {
    const activeEditors = [
      { client_id: 'client1', cursor_position: 5 }
    ]
    
    render(<CollaborativeEditor 
      {...defaultProps} 
      isCollaborative={true}
      activeEditors={activeEditors}
    />)
    
    expect(screen.getByText('1 other editor online')).toBeInTheDocument()
  })

  test('hides active editors indicator when not collaborative', () => {
    const activeEditors = [
      { client_id: 'client1', cursor_position: 5 }
    ]
    
    render(<CollaborativeEditor 
      {...defaultProps} 
      isCollaborative={false}
      activeEditors={activeEditors}
    />)
    
    expect(screen.queryByText('1 other editor online')).not.toBeInTheDocument()
  })

  test('hides active editors indicator when no active editors', () => {
    render(<CollaborativeEditor 
      {...defaultProps} 
      isCollaborative={true}
      activeEditors={[]}
    />)
    
    expect(screen.queryByText(/other editor/)).not.toBeInTheDocument()
  })

  test('renders cursor indicators for active editors', () => {
    const activeEditors = [
      { client_id: 'client1', cursor_position: 5 },
      { client_id: 'client2', cursor_position: 10 }
    ]
    
    render(<CollaborativeEditor 
      {...defaultProps} 
      content="Hello world test content"
      isCollaborative={true}
      activeEditors={activeEditors}
    />)
    
    const cursors = document.querySelectorAll('.cursor-indicator')
    expect(cursors).toHaveLength(2)
  })

  test('does not render cursors when not collaborative', () => {
    const activeEditors = [
      { client_id: 'client1', cursor_position: 5 }
    ]
    
    render(<CollaborativeEditor 
      {...defaultProps} 
      content="Hello world"
      isCollaborative={false}
      activeEditors={activeEditors}
    />)
    
    const cursors = document.querySelectorAll('.cursor-indicator')
    expect(cursors).toHaveLength(0)
  })

  test('auto-resizes textarea based on content', async () => {
    const { rerender } = render(<CollaborativeEditor {...defaultProps} content="" />)
    
    const editor = screen.getByPlaceholderText('Start writing...')
    const initialHeight = editor.style.height
    
    const longContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5'
    rerender(<CollaborativeEditor {...defaultProps} content={longContent} />)
    
    await waitFor(() => {
      // Height should increase with more content
      expect(editor.style.height).not.toBe(initialHeight)
    })
  })

  test('prevents onChange calls during external updates', async () => {
    const onContentChange = jest.fn()
    const { rerender } = render(<CollaborativeEditor 
      {...defaultProps} 
      content="Initial"
      onContentChange={onContentChange}
    />)
    
    // Simulate external content update
    rerender(<CollaborativeEditor 
      {...defaultProps} 
      content="Updated externally"
      onContentChange={onContentChange}
    />)
    
    // onContentChange should not be called for external updates
    expect(onContentChange).not.toHaveBeenCalled()
  })

  test('preserves cursor position during external updates', async () => {
    const { rerender } = render(<CollaborativeEditor {...defaultProps} content="Hello world" />)
    
    const editor = screen.getByDisplayValue('Hello world')
    
    // Set cursor position
    editor.selectionStart = 5
    editor.selectionEnd = 5
    
    // Simulate external update
    rerender(<CollaborativeEditor {...defaultProps} content="Hello beautiful world" />)
    
    await waitFor(() => {
      // Cursor position should be preserved (or close to it)
      expect(editor.selectionStart).toBeLessThanOrEqual(6) // Allow for minor adjustments
    })
  })

  test('forwards ref correctly', () => {
    const ref = { current: null }
    
    render(<CollaborativeEditor {...defaultProps} ref={ref} />)
    
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement)
  })

  test('applies correct styling classes', () => {
    render(<CollaborativeEditor 
      {...defaultProps} 
      isCollaborative={true}
      activeEditors={[{ client_id: 'client1', cursor_position: 0 }]}
    />)
    
    const container = document.querySelector('.collaborative-editor-container')
    const editor = screen.getByPlaceholderText('Start writing...')
    const indicator = screen.getByText('1 other editor online')
    
    expect(container).toBeInTheDocument()
    expect(editor).toHaveClass('editor')
    expect(indicator).toHaveClass('active-editors-indicator')
  })
})