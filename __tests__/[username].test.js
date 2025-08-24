import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/router'
import UserPage from '../pages/[username]'
import { supabase } from '../lib/supabase'

// Mock the router with different scenarios
const mockPush = jest.fn()
const mockRouter = {
  query: { username: 'testuser' },
  push: mockPush,
}

jest.mock('next/router', () => ({
  useRouter: () => mockRouter
}))

describe('User Writing Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.crypto.randomUUID = jest.fn(() => 'test-uuid-12345')
    
    // Mock successful user existence check by default
    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ data: [{ username: 'testuser' }], error: null }))
          }))
        }
      }
      if (table === 'documents') {
        return {
          upsert: jest.fn(() => Promise.resolve({ data: {}, error: null }))
        }
      }
    })
  })

  test('shows loading state initially', () => {
    render(<UserPage />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  test('renders user page when user exists', async () => {
    render(<UserPage />)
    
    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Start writing...')).toBeInTheDocument()
    })
  })

  test('shows user not found when user does not exist', async () => {
    supabase.from.mockImplementation(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
      }))
    }))
    
    render(<UserPage />)
    
    await waitFor(() => {
      expect(screen.getByText('User Not Found')).toBeInTheDocument()
      expect(screen.getByText('The user "testuser" doesn\'t exist.')).toBeInTheDocument()
    })
  })

  test('updates content when typing in editor', async () => {
    const user = userEvent.setup()
    render(<UserPage />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Start writing...')).toBeInTheDocument()
    })
    
    const editor = screen.getByPlaceholderText('Start writing...')
    await user.type(editor, 'Hello, world!')
    
    expect(editor.value).toBe('Hello, world!')
  })

  test('auto-saves content after typing with debounce', async () => {
    const mockUpsert = jest.fn(() => Promise.resolve({ data: {}, error: null }))
    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ data: [{ username: 'testuser' }], error: null }))
          }))
        }
      }
      if (table === 'documents') {
        return {
          upsert: mockUpsert
        }
      }
    })
    
    const user = userEvent.setup()
    render(<UserPage />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Start writing...')).toBeInTheDocument()
    })
    
    const editor = screen.getByPlaceholderText('Start writing...')
    await user.type(editor, 'Test content')
    
    // Wait for the debounced save (1000ms timeout)
    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith({
        id: 'test-uuid-12345',
        username: 'testuser',
        content: 'Test content',
        updated_at: expect.any(Date)
      })
    }, { timeout: 2000 })
  })

  test('toggles shortcuts modal with help button click', async () => {
    const user = userEvent.setup()
    render(<UserPage />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Start writing...')).toBeInTheDocument()
    })
    
    // Click help button to open
    const helpButton = screen.getByTitle('Toggle keyboard shortcuts')
    await user.click(helpButton)
    
    await waitFor(() => {
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
    })
    
    // Click help button again to close
    await user.click(helpButton)
    
    await waitFor(() => {
      expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument()
    })
  })

  test('inserts date and time with Ctrl + Alt + D on PC', async () => {
    const mockDate = new Date('2023-01-01 12:00:00')
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
    const mockToLocaleString = jest.fn(() => '1/1/2023, 12:00:00 PM')
    mockDate.toLocaleString = mockToLocaleString
    
    render(<UserPage />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Start writing...')).toBeInTheDocument()
    })
    
    const editor = screen.getByPlaceholderText('Start writing...')
    editor.focus()
    
    // Press Ctrl + Alt + D
    fireEvent.keyDown(window, { key: 'd', code: 'KeyD', ctrlKey: true, altKey: true })
    
    await waitFor(() => {
      expect(editor.value).toBe('1/1/2023, 12:00:00 PM')
    })
    
    jest.restoreAllMocks()
  })

  test('inserts date and time with Ctrl + Option + D on Mac', async () => {
    // Mock Mac platform
    const mockNavigator = {
      userAgentData: { platform: 'macOS' },
      platform: 'MacIntel'
    }
    
    Object.defineProperty(window, 'navigator', {
      value: mockNavigator,
      writable: true
    })
    
    const mockDate = new Date('2023-01-01 12:00:00')
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
    const mockToLocaleString = jest.fn(() => '1/1/2023, 12:00:00 PM')
    mockDate.toLocaleString = mockToLocaleString
    
    render(<UserPage />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Start writing...')).toBeInTheDocument()
    })
    
    const editor = screen.getByPlaceholderText('Start writing...')
    editor.focus()
    
    // Press Ctrl + Alt + D (same keys, just displayed differently on Mac)
    fireEvent.keyDown(window, { key: 'd', code: 'KeyD', ctrlKey: true, altKey: true })
    
    await waitFor(() => {
      expect(editor.value).toBe('1/1/2023, 12:00:00 PM')
    })
    
    jest.restoreAllMocks()
  })

  test('generates unique document ID for each user session', async () => {
    const mockUUID1 = 'uuid-1'
    const mockUUID2 = 'uuid-2'
    
    global.crypto.randomUUID = jest
      .fn()
      .mockReturnValueOnce(mockUUID1)
      .mockReturnValueOnce(mockUUID2)
    
    // First render
    const { unmount } = render(<UserPage />)
    
    await waitFor(() => {
      expect(global.crypto.randomUUID).toHaveBeenCalledTimes(1)
    })
    
    unmount()
    
    // Second render with different user
    mockRouter.query.username = 'different-user'
    render(<UserPage />)
    
    await waitFor(() => {
      expect(global.crypto.randomUUID).toHaveBeenCalledTimes(2)
    })
  })

  test('handles platform detection for Mac shortcuts', async () => {
    const mockNavigator = {
      userAgentData: { platform: 'macOS' },
      platform: 'MacIntel'
    }
    
    Object.defineProperty(window, 'navigator', {
      value: mockNavigator,
      writable: true
    })
    
    render(<UserPage />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Start writing...')).toBeInTheDocument()
    })
    
    // The component should detect Mac platform (this affects internal state)
    // We can click the help button to open shortcuts
    const helpButton = screen.getByTitle('Toggle keyboard shortcuts')
    fireEvent.click(helpButton)
    
    await waitFor(() => {
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
      // Should show the shortcuts list with Ctrl + Option + D on Mac
      expect(screen.getByText('Ctrl + Option + D')).toBeInTheDocument()
    })
  })

  test('does not save content when user does not exist', async () => {
    const mockUpsert = jest.fn()
    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
          }))
        }
      }
      if (table === 'documents') {
        return {
          upsert: mockUpsert
        }
      }
    })
    
    render(<UserPage />)
    
    await waitFor(() => {
      expect(screen.getByText('User Not Found')).toBeInTheDocument()
    })
    
    // Wait to ensure no save attempt is made
    await new Promise(resolve => setTimeout(resolve, 1500))
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  test('renders help button in bottom right corner', async () => {
    render(<UserPage />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Start writing...')).toBeInTheDocument()
    })
    
    const helpButton = screen.getByTitle('Toggle keyboard shortcuts')
    expect(helpButton).toBeInTheDocument()
    expect(helpButton).toHaveTextContent('?')
  })

  test('does not save empty or whitespace-only content', async () => {
    // Reset router state
    mockRouter.query.username = 'testuser'
    
    const mockUpsert = jest.fn(() => Promise.resolve({ data: {}, error: null }))
    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ data: [{ username: 'testuser' }], error: null }))
          }))
        }
      }
      if (table === 'documents') {
        return {
          upsert: mockUpsert
        }
      }
    })
    
    const user = userEvent.setup()
    render(<UserPage />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Start writing...')).toBeInTheDocument()
    })
    
    const editor = screen.getByPlaceholderText('Start writing...')
    
    // Test whitespace-only content
    await user.type(editor, '   ')
    await new Promise(resolve => setTimeout(resolve, 1200))
    expect(mockUpsert).not.toHaveBeenCalled()
    
    // Test that actual content still gets saved
    await user.clear(editor)
    await user.type(editor, 'Real content')
    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith({
        id: 'test-uuid-12345',
        username: 'testuser',
        content: 'Real content',
        updated_at: expect.any(Date)
      })
    }, { timeout: 2000 })
  }, 10000)
})