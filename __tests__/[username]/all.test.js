import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { supabase } from '../../lib/supabase'
import AllEntriesPage from '../../pages/[username]/all'

// Mock PublicKeyEncryption
jest.mock('../../lib/publicKeyEncryption', () => ({
  PublicKeyEncryption: {
    decrypt: jest.fn((encryptedContent, encryptedDataKey, password, encryptedPrivateKey, salt) => {
      // Mock successful decryption for valid test data
      if (password === 'correctpassword') {
        if (encryptedContent === 'encrypted-content-1') return 'This is my first entry with some content.'
        if (encryptedContent === 'encrypted-content-2') return 'Another entry with different content.\nThis one has multiple lines.'
        if (encryptedContent === 'encrypted-content-3') return 'Latest entry should appear first.'
        if (encryptedContent === 'encrypted-formatting') return 'Line 1\nLine 2\n\nLine 4 with spaces   '
        return 'Decrypted content'
      }
      throw new Error('Invalid password')
    })
  }
}))

// Mock the router with different scenarios
const mockPush = jest.fn()
const mockRouter = {
  query: { username: 'testuser' },
  push: mockPush,
}

jest.mock('next/router', () => ({
  useRouter: () => mockRouter
}))

// Mock sample entries data with encrypted format
const mockEntries = [
  {
    id: 'entry-1',
    username: 'testuser',
    encrypted_content: 'encrypted-content-1',
    encrypted_data_key: 'encrypted-data-key-1',
    created_at: '2023-01-01T10:00:00Z',
    updated_at: '2023-01-01T10:00:00Z'
  },
  {
    id: 'entry-2',
    username: 'testuser',
    encrypted_content: 'encrypted-content-2',
    encrypted_data_key: 'encrypted-data-key-2',
    created_at: '2023-01-02T15:30:00Z',
    updated_at: '2023-01-02T15:30:00Z'
  },
  {
    id: 'entry-3',
    username: 'testuser',
    encrypted_content: 'encrypted-content-3',
    encrypted_data_key: 'encrypted-data-key-3',
    created_at: '2023-01-03T09:15:00Z',
    updated_at: '2023-01-03T09:15:00Z'
  }
]

describe('All Entries Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Reset router state
    mockRouter.query = { username: 'testuser' }

    // Mock successful user existence check by default
    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ 
              data: [{ 
                username: 'testuser',
                salt: 'mock-salt',
                encrypted_private_key: 'mock-encrypted-private-key',
                is_public: false
              }], 
              error: null 
            }))
          }))
        }
      }
      if (table === 'documents') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => Promise.resolve({ data: mockEntries, error: null }))
            }))
          }))
        }
      }
    })
  })

  test('shows loading state initially', () => {
    render(<AllEntriesPage />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  test('renders all entries page when user exists with entries', async () => {
    const user = userEvent.setup()
    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument()
      expect(screen.getByText('all entries')).toBeInTheDocument()
    })

    // Should show password prompt initially
    await waitFor(() => {
      expect(screen.getByText('Enter password to decrypt entries')).toBeInTheDocument()
    })

    // Enter password and submit
    const passwordInput = screen.getByPlaceholderText('••••••••')
    await user.type(passwordInput, 'correctpassword')
    
    const submitButton = screen.getByText('[Unlock →]')
    await user.click(submitButton)

    // Check that all entries are displayed after decryption
    await waitFor(() => {
      expect(screen.getByText('This is my first entry with some content.')).toBeInTheDocument()
      expect(screen.getByText(/Another entry with different content/)).toBeInTheDocument()
      expect(screen.getByText('Latest entry should appear first.')).toBeInTheDocument()
    })
  })

  test('shows user not found when user does not exist', async () => {
    supabase.from.mockImplementation(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
      }))
    }))

    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(screen.getByText('User Not Found')).toBeInTheDocument()
      expect(screen.getByText('The user "testuser" doesn\'t exist.')).toBeInTheDocument()
    })
  })

  test('shows no entries message when user exists but has no entries', async () => {
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
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => Promise.resolve({ data: [], error: null }))
            }))
          }))
        }
      }
    })

    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument()
      expect(screen.getByText('No entries found for testuser')).toBeInTheDocument()
    })
  })

  test('displays entries with formatted timestamps after password entry', async () => {
    const user = userEvent.setup()
    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(screen.getByText('Enter password to decrypt entries')).toBeInTheDocument()
    })

    // Enter password and decrypt
    const passwordInput = screen.getByPlaceholderText('••••••••')
    await user.type(passwordInput, 'correctpassword')
    
    const submitButton = screen.getByText('[Unlock →]')
    await user.click(submitButton)

    await waitFor(() => {
      // Check that timestamps are formatted and displayed
      const timestamps = screen.getAllByText(/\d{1,2}\/\d{1,2}\/\d{4}/)
      expect(timestamps.length).toBeGreaterThan(0)
    })
  })

  test('queries documents in correct order (newest first)', async () => {
    const mockOrder = jest.fn(() => Promise.resolve({ data: mockEntries, error: null }))
    const mockEq = jest.fn(() => ({ order: mockOrder }))
    const mockSelect = jest.fn(() => ({ eq: mockEq }))

    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ data: [{ username: 'testuser' }], error: null }))
          }))
        }
      }
      if (table === 'documents') {
        return { select: mockSelect }
      }
    })

    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalledWith('id, username, encrypted_content, encrypted_data_key, created_at, updated_at, client_snapshot_id')
      expect(mockEq).toHaveBeenCalledWith('username', 'testuser')
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false })
    })
  })

  test('preserves legacy recency ordering using updated_at fallback', async () => {
    const user = userEvent.setup()
    const legacyAndNewEntries = [
      {
        id: 'legacy-entry',
        username: 'testuser',
        encrypted_content: 'encrypted-content-1',
        encrypted_data_key: 'legacy-key',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-10T00:00:00Z'
      },
      {
        id: 'new-entry',
        username: 'testuser',
        encrypted_content: 'encrypted-content-3',
        encrypted_data_key: 'new-key',
        created_at: '2023-01-09T00:00:00Z',
        updated_at: null
      }
    ]

    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({
              data: [{
                username: 'testuser',
                salt: 'mock-salt',
                encrypted_private_key: 'mock-encrypted-private-key',
                is_public: false
              }],
              error: null
            }))
          }))
        }
      }
      if (table === 'documents') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => Promise.resolve({ data: legacyAndNewEntries, error: null }))
            }))
          }))
        }
      }
    })

    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(screen.getByText('Enter password to decrypt entries')).toBeInTheDocument()
    })

    const passwordInput = screen.getByPlaceholderText('••••••••')
    await user.type(passwordInput, 'correctpassword')
    await user.click(screen.getByText('[Unlock →]'))

    await waitFor(() => {
      expect(screen.getByText('This is my first entry with some content.')).toBeInTheDocument()
      expect(screen.getByText('Latest entry should appear first.')).toBeInTheDocument()
    })

    const contentNodes = Array.from(document.querySelectorAll('.entry-content'))
    expect(contentNodes[0]).toHaveTextContent('This is my first entry with some content.')
    expect(contentNodes[1]).toHaveTextContent('Latest entry should appear first.')
  })

  test('back link has been removed in new design', async () => {
    render(<AllEntriesPage />)

    await waitFor(() => {
      const backLink = screen.queryByText('← Back to write')
      expect(backLink).not.toBeInTheDocument()
    })
  })

  test('handles different usernames correctly', async () => {
    // Change router to different username
    mockRouter.query.username = 'anotheruser'

    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ data: [{ username: 'anotheruser' }], error: null }))
          }))
        }
      }
      if (table === 'documents') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => Promise.resolve({ data: [], error: null }))
            }))
          }))
        }
      }
    })

    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(screen.getByText('anotheruser')).toBeInTheDocument()
      expect(screen.getByText('No entries found for anotheruser')).toBeInTheDocument()
    })

    // Back link removed in new design
    const backLink = screen.queryByText('← Back to write')
    expect(backLink).not.toBeInTheDocument()
  })

  test('preserves whitespace and line breaks in entry content', async () => {
    const user = userEvent.setup()
    const entryWithFormatting = {
      id: 'formatted-entry',
      username: 'testuser',
      encrypted_content: 'encrypted-formatting',
      encrypted_data_key: 'encrypted-data-key-formatting',
      created_at: '2023-01-01T10:00:00Z',
      updated_at: '2023-01-01T10:00:00Z'
    }

    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ 
              data: [{ 
                username: 'testuser',
                salt: 'mock-salt',
                encrypted_private_key: 'mock-encrypted-private-key'
              }], 
              error: null 
            }))
          }))
        }
      }
      if (table === 'documents') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => Promise.resolve({ data: [entryWithFormatting], error: null }))
            }))
          }))
        }
      }
    })

    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })

    // Enter password to decrypt
    const passwordInput = screen.getByPlaceholderText('••••••••')
    await user.type(passwordInput, 'correctpassword')
    
    const submitButton = screen.getByText('[Unlock →]')
    await user.click(submitButton)

    await waitFor(() => {
      const contentElement = screen.getByText(/Line 1/)
      expect(contentElement).toBeInTheDocument()
    })
  })

  test('handles null or undefined entries gracefully', async () => {
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
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() => Promise.resolve({ data: null, error: null }))
            }))
          }))
        }
      }
    })

    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText('No entries found for testuser')).toBeInTheDocument()
    })
  })

  test('does not crash when router query is undefined', () => {
    mockRouter.query = {}

    render(<AllEntriesPage />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  test('applies dark mode styles correctly', async () => {
    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })

    // Check that dark mode CSS variables are applied
    expect(document.head.innerHTML).toContain('@media(prefers-color-scheme:dark)')
  })

  test('entry dates are properly formatted and displayed', async () => {
    const user = userEvent.setup()
    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })

    // Enter password and decrypt
    const passwordInput = screen.getByPlaceholderText('••••••••')
    await user.type(passwordInput, 'correctpassword')
    
    const submitButton = screen.getByText('[Unlock →]')
    await user.click(submitButton)

    await waitFor(() => {
      // Check that timestamps are formatted and displayed
      const timestamps = screen.getAllByText(/\d{1,2}\/\d{1,2}\/\d{4}/)
      expect(timestamps.length).toBeGreaterThan(0)
    })
  })

  test('entries are displayed with proper styling and structure', async () => {
    const user = userEvent.setup()
    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })

    // Enter password to decrypt entries
    const passwordInput = screen.getByPlaceholderText('••••••••')
    await user.type(passwordInput, 'correctpassword')
    
    const submitButton = screen.getByText('[Unlock →]')
    await user.click(submitButton)

    await waitFor(() => {
      const entryElements = document.querySelectorAll('.entry')
      expect(entryElements.length).toBe(mockEntries.length)

      // Check that each entry has the required structure
      entryElements.forEach(entry => {
        expect(entry.querySelector('.entry-header')).toBeTruthy()
        expect(entry.querySelector('.entry-date')).toBeTruthy()
        expect(entry.querySelector('.entry-content')).toBeTruthy()
      })
    })
  })
})
