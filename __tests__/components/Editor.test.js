import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import Editor from '../../components/Editor'

describe('Editor Component', () => {
  let mockSetContent

  beforeEach(() => {
    mockSetContent = jest.fn()
  })

  test('renders textarea with placeholder', () => {
    render(<Editor content="" setContent={mockSetContent} />)
    
    const textarea = screen.getByPlaceholderText('Start writing...')
    expect(textarea).toBeInTheDocument()
    expect(textarea).toHaveClass('editor')
  })

  test('displays provided content', () => {
    const testContent = 'Hello, world!'
    render(<Editor content={testContent} setContent={mockSetContent} />)
    
    const textarea = screen.getByDisplayValue(testContent)
    expect(textarea).toBeInTheDocument()
  })

  test('calls setContent when typing', async () => {
    const user = userEvent.setup()
    render(<Editor content="" setContent={mockSetContent} />)
    
    const textarea = screen.getByPlaceholderText('Start writing...')
    await user.type(textarea, 'Test')
    
    expect(mockSetContent).toHaveBeenCalled()
    // Check that setContent is called for each character
    expect(mockSetContent).toHaveBeenCalledTimes(4)
  })

  test('calls setContent when content changes', async () => {
    const user = userEvent.setup()
    render(<Editor content="" setContent={mockSetContent} />)
    
    const textarea = screen.getByPlaceholderText('Start writing...')
    
    // Trigger onChange directly
    fireEvent.change(textarea, { target: { value: 'New content' } })
    
    expect(mockSetContent).toHaveBeenCalledWith('New content')
  })

  test('auto-resizes based on content', () => {
    const { rerender } = render(<Editor content="" setContent={mockSetContent} />)
    
    const textarea = screen.getByPlaceholderText('Start writing...')
    
    // Mock scrollHeight
    Object.defineProperty(textarea, 'scrollHeight', {
      writable: true,
      value: 100
    })
    
    // Re-render with content to trigger useEffect
    rerender(<Editor content="Some content that might be longer" setContent={mockSetContent} />)
    
    // The useEffect should set height to auto then to scrollHeight
    expect(textarea.style.height).toBe('100px')
  })

  test('works with forwarded ref', () => {
    const TestComponent = () => {
      const editorRef = useRef(null)
      return (
        <div>
          <Editor content="test" setContent={mockSetContent} ref={editorRef} />
          <button onClick={() => editorRef.current?.focus()}>Focus</button>
        </div>
      )
    }
    
    render(<TestComponent />)
    
    const textarea = screen.getByDisplayValue('test')
    const button = screen.getByText('Focus')
    
    expect(textarea).toBeInTheDocument()
    expect(button).toBeInTheDocument()
  })

  test('handles empty content', () => {
    render(<Editor content="" setContent={mockSetContent} />)
    
    const textarea = screen.getByPlaceholderText('Start writing...')
    expect(textarea.value).toBe('')
  })

  test('handles multiline content', () => {
    const multilineContent = 'Line 1\nLine 2\nLine 3'
    render(<Editor content={multilineContent} setContent={mockSetContent} />)
    
    const textarea = screen.getByPlaceholderText('Start writing...')
    expect(textarea).toBeInTheDocument()
    expect(textarea.value).toBe(multilineContent)
  })

  test('has correct CSS classes and attributes', () => {
    render(<Editor content="test" setContent={mockSetContent} />)
    
    const textarea = screen.getByDisplayValue('test')
    expect(textarea.className).toContain('editor')
    expect(textarea).toHaveAttribute('placeholder', 'Start writing...')
    // CSS styles from styled-jsx may not be directly testable in JSDOM
    expect(textarea.tagName).toBe('TEXTAREA')
  })

  test('auto-resize effect runs on content change', () => {
    const { rerender } = render(<Editor content="" setContent={mockSetContent} />)
    
    const textarea = screen.getByPlaceholderText('Start writing...')
    
    // Mock the scrollHeight property
    const mockScrollHeight = jest.fn()
    Object.defineProperty(textarea, 'scrollHeight', {
      get: mockScrollHeight.mockReturnValue(150)
    })
    
    // Trigger re-render with new content
    act(() => {
      rerender(<Editor content="New longer content that should trigger resize" setContent={mockSetContent} />)
    })
    
    // Check that height was set to auto first, then to scrollHeight
    expect(textarea.style.height).toBe('150px')
  })

  test('textarea supports selection range functionality', async () => {
    const user = userEvent.setup()
    render(<Editor content="" setContent={mockSetContent} />)
    
    const textarea = screen.getByPlaceholderText('Start writing...')
    
    // Type some content
    await user.type(textarea, 'Hello')
    
    // Test that textarea supports selection methods
    expect(typeof textarea.setSelectionRange).toBe('function')
    expect(typeof textarea.selectionStart).toBe('number')
    expect(typeof textarea.selectionEnd).toBe('number')
  })
})