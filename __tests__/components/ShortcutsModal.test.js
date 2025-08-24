import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShortcutsModal } from '../../components/ShortcutsModal'

describe('ShortcutsModal Component', () => {
  const mockOnClose = jest.fn()
  const mockShortcuts = [
    { keys: 'Ctrl + Alt + D', description: 'Insert current date and time' },
    { keys: 'Ctrl + S', description: 'Save document' }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('does not render when isOpen is false', () => {
    render(
      <ShortcutsModal 
        isOpen={false} 
        onClose={mockOnClose} 
        shortcuts={mockShortcuts} 
      />
    )
    
    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument()
  })

  test('renders modal when isOpen is true', () => {
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={mockShortcuts} 
      />
    )
    
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
  })

  test('renders all provided shortcuts', () => {
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={mockShortcuts} 
      />
    )
    
    expect(screen.getByText('Ctrl + Alt + D')).toBeInTheDocument()
    expect(screen.getByText(/Insert current date and time/)).toBeInTheDocument()
    
    expect(screen.getByText('Ctrl + S')).toBeInTheDocument()
    expect(screen.getByText(/Save document/)).toBeInTheDocument()
  })

  test('shows escape instruction', () => {
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={mockShortcuts} 
      />
    )
    
    expect(screen.getByText('Press Esc to close')).toBeInTheDocument()
  })

  test('calls onClose when clicking overlay', async () => {
    const user = userEvent.setup()
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={mockShortcuts} 
      />
    )
    
    const overlay = screen.getByText('Keyboard Shortcuts').closest('div').parentElement
    await user.click(overlay)
    
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  test('does not call onClose when clicking modal content', async () => {
    const user = userEvent.setup()
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={mockShortcuts} 
      />
    )
    
    const modalContent = screen.getByText('Keyboard Shortcuts').closest('div')
    await user.click(modalContent)
    
    expect(mockOnClose).not.toHaveBeenCalled()
  })

  test('handles empty shortcuts array', () => {
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={[]} 
      />
    )
    
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
    expect(screen.getByText('Press Esc to close')).toBeInTheDocument()
    
    // Should not have any shortcut items
    const list = screen.getByRole('list')
    expect(list).toBeEmptyDOMElement()
  })

  test('renders shortcuts with proper key-description structure', () => {
    const singleShortcut = [
      { keys: 'Ctrl + Z', description: 'Undo last action' }
    ]
    
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={singleShortcut} 
      />
    )
    
    const listItem = screen.getByRole('listitem')
    const strongElement = screen.getByText('Ctrl + Z')
    
    expect(listItem).toContainElement(strongElement)
    expect(listItem).toHaveTextContent('Ctrl + Z: Undo last action')
  })

  test('has correct modal styling and positioning', () => {
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={mockShortcuts} 
      />
    )
    
    const overlay = screen.getByText('Keyboard Shortcuts').closest('div').parentElement
    const modalContent = screen.getByText('Keyboard Shortcuts').closest('div')
    
    // Check overlay styles
    expect(overlay).toHaveStyle({
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      background: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff'
    })
    
    // Check modal content styles
    expect(modalContent).toHaveStyle({
      background: '#333',
      padding: '20px',
      borderRadius: '8px',
      minWidth: '300px'
    })
  })

  test('prevents event propagation when clicking modal content', () => {
    const mockStopPropagation = jest.fn()
    
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={mockShortcuts} 
      />
    )
    
    const modalContent = screen.getByText('Keyboard Shortcuts').closest('div')
    
    // Create a mock event with stopPropagation
    const mockEvent = {
      stopPropagation: mockStopPropagation
    }
    
    // Trigger the onClick handler directly
    fireEvent.click(modalContent)
    
    // The component should call stopPropagation to prevent closing when clicking inside
    // We can't directly test the stopPropagation call, but we can test that onClose wasn't called
    expect(mockOnClose).not.toHaveBeenCalled()
  })

  test('uses description as key for list items', () => {
    const shortcutsWithDuplicateKeys = [
      { keys: 'Ctrl + C', description: 'Copy text' },
      { keys: 'Ctrl + C', description: 'Cancel operation' }
    ]
    
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={shortcutsWithDuplicateKeys} 
      />
    )
    
    expect(screen.getByText(/Copy text/)).toBeInTheDocument()
    expect(screen.getByText(/Cancel operation/)).toBeInTheDocument()
    
    const listItems = screen.getAllByRole('listitem')
    expect(listItems).toHaveLength(2)
  })
})