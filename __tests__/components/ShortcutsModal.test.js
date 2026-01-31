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
    
    expect(screen.queryByText('Help')).not.toBeInTheDocument()
  })

  test('renders modal when isOpen is true', () => {
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={mockShortcuts} 
      />
    )
    
    expect(screen.getByText('Help')).toBeInTheDocument()
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
    
    const overlay = screen.getByText('Help').closest('div').parentElement
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
    
    const modalContent = screen.getByText('Help').closest('div')
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
    
    expect(screen.getByText('Help')).toBeInTheDocument()
    expect(screen.getByText('Press Esc to close')).toBeInTheDocument()
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
    
    const strongElement = screen.getByText('Ctrl + Z')
    expect(strongElement).toBeInTheDocument()
    expect(screen.getByText(/Undo last action/)).toBeInTheDocument()
  })

  test('has correct modal styling and positioning', () => {
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={mockShortcuts} 
      />
    )
    
    const overlay = screen.getByText('Help').closest('div').parentElement
    const modalContent = screen.getByText('Help').closest('div')
    
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
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={mockShortcuts} 
      />
    )
    
    const modalContent = screen.getByText('Help').closest('div')
    
    // Trigger the onClick handler directly
    fireEvent.click(modalContent)
    
    // The component should call stopPropagation to prevent closing when clicking inside
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
  })

  test('renders navigation section with back to home link', () => {
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={mockShortcuts} 
      />
    )
    
    expect(screen.getByText('Navigation')).toBeInTheDocument()
    expect(screen.getByText('Back to home')).toBeInTheDocument()
  })

  test('renders view all entries link when username is provided', () => {
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={mockShortcuts}
        username="testuser"
      />
    )
    
    const allEntriesLink = screen.getByText('View all entries →')
    expect(allEntriesLink).toBeInTheDocument()
    expect(allEntriesLink).toHaveAttribute('href', '/testuser/all')
  })

  test('does not render view all entries link when username is not provided', () => {
    render(
      <ShortcutsModal 
        isOpen={true} 
        onClose={mockOnClose} 
        shortcuts={mockShortcuts} 
      />
    )
    
    expect(screen.queryByText('View all entries →')).not.toBeInTheDocument()
  })
})