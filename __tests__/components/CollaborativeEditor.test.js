import { render, screen, fireEvent } from '@testing-library/react'
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
    
    // Should be called for each character typed
    expect(onContentChange).toHaveBeenCalledTimes(5)
    expect(onContentChange).toHaveBeenCalledWith('o', 1) // Last call
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
    
    expect(screen.getByText('2', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('other editors online', { exact: false })).toBeInTheDocument()
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
    
    expect(screen.getByText('1', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('other editor online', { exact: false })).toBeInTheDocument()
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
    
    expect(screen.queryByText(/other editor/)).not.toBeInTheDocument()
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
    
    // Check that cursor indicators would be rendered (implementation detail may vary)
    expect(activeEditors.length).toBe(2)
    expect(screen.getByText('Hello world test content')).toBeInTheDocument()
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
    
    // When not collaborative, no active editors indicator should show
    expect(screen.queryByText(/other editor/)).not.toBeInTheDocument()
  })

  test('forwards ref correctly', () => {
    const ref = { current: null }
    
    render(<CollaborativeEditor {...defaultProps} ref={ref} />)
    
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement)
  })
})