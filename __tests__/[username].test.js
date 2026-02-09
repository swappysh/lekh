import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { supabase } from '../lib/supabase'
import UserPage from '../pages/[username]'
import { PublicKeyEncryption } from '../lib/publicKeyEncryption'

// Mock PublicKeyEncryption
jest.mock('../lib/publicKeyEncryption', () => ({
  PublicKeyEncryption: {
    encrypt: jest.fn(() => Promise.resolve({
      encryptedContent: 'mock-encrypted-content',
      encryptedDataKey: 'mock-encrypted-data-key'
    })),
    decrypt: jest.fn((enc) => Promise.resolve(`Decrypted ${enc}`))
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

describe('User Writing Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRouter.query = { username: 'testuser' }
    global.crypto.randomUUID = jest.fn(() => 'test-uuid-12345')
    Object.defineProperty(window.navigator, 'sendBeacon', {
      value: jest.fn(() => false),
      writable: true,
      configurable: true
    })
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true })
    }))

    // Mock successful user existence check by default
    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ data: [{ username: 'testuser', public_key: 'mock-public-key' }], error: null }))
          }))
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

  test('appends private snapshot through API on flush event', async () => {
    const user = userEvent.setup()
    render(<UserPage />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Start writing...')).toBeInTheDocument()
    })

    const editor = screen.getByPlaceholderText('Start writing...')
    await user.type(editor, 'Test content')

    await waitFor(() => {
      expect(PublicKeyEncryption.encrypt).toHaveBeenCalledWith('Test content', 'mock-public-key')
    })

    fireEvent(window, new Event('beforeunload'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/private-append', expect.objectContaining({
        method: 'POST'
      }))
    })

    const payload = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(payload).toMatchObject({
        username: 'testuser',
      encryptedContent: 'mock-encrypted-content',
      encryptedDataKey: 'mock-encrypted-data-key'
    })
    expect(payload.clientSnapshotId).toContain('test-uuid-12345')
  })

  test('flushes prepared snapshot on unload without re-encrypting', async () => {
    const user = userEvent.setup()
    render(<UserPage />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Start writing...')).toBeInTheDocument()
    })

    const editor = screen.getByPlaceholderText('Start writing...')
    await user.type(editor, 'Prepared content')

    await waitFor(() => {
      expect(PublicKeyEncryption.encrypt).toHaveBeenCalledWith('Prepared content', 'mock-public-key')
    })

    PublicKeyEncryption.encrypt.mockClear()
    fireEvent(window, new Event('beforeunload'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
    expect(PublicKeyEncryption.encrypt).not.toHaveBeenCalled()
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

  test('reuses clientSnapshotId when retrying same unsaved content', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Temporary failure' })
      })
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true })
      })

    const user = userEvent.setup()
    render(<UserPage />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Start writing...')).toBeInTheDocument()
    })

    const editor = screen.getByPlaceholderText('Start writing...')
    await user.type(editor, 'Retry content')

    await waitFor(() => {
      expect(PublicKeyEncryption.encrypt).toHaveBeenCalledWith('Retry content', 'mock-public-key')
    })

    fireEvent(window, new Event('beforeunload'))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    fireEvent(window, new Event('beforeunload'))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    const firstPayload = JSON.parse(global.fetch.mock.calls[0][1].body)
    const secondPayload = JSON.parse(global.fetch.mock.calls[1][1].body)

    expect(firstPayload.clientSnapshotId).toBe(secondPayload.clientSnapshotId)
    expect(firstPayload.encryptedContent).toBe(secondPayload.encryptedContent)
    expect(firstPayload.encryptedDataKey).toBe(secondPayload.encryptedDataKey)
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
    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
          }))
        }
      }
    })

    render(<UserPage />)

    await waitFor(() => {
      expect(screen.getByText('User Not Found')).toBeInTheDocument()
    })

    fireEvent(window, new Event('beforeunload'))
    expect(global.fetch).not.toHaveBeenCalled()
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

    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ data: [{ username: 'testuser', public_key: 'mock-public-key' }], error: null }))
          }))
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
    fireEvent(window, new Event('beforeunload'))
    expect(global.fetch).not.toHaveBeenCalled()

    // Test that actual content still gets saved
    await user.clear(editor)
    await user.type(editor, 'Real content')

    await waitFor(() => {
      expect(PublicKeyEncryption.encrypt).toHaveBeenCalledWith('Real content', 'mock-public-key')
    })

    fireEvent(window, new Event('beforeunload'))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  }, 10000)

  test('renders public page with collaborative editor', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({
              data: [{
                username: 'testuser',
                public_key: 'mock-public-key',
                is_public: true,
                encrypted_private_key: 'mock-encrypted-private-key',
                salt: 'mock-salt'
              }],
              error: null
            }))
          }))
        }
      }
      // Mock collaborative document tables
      if (table === 'collaborative_documents') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
            }))
          })),
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({ data: { username: 'testuser', content: '', version: 0 }, error: null }))
            }))
          }))
        }
      }
      if (table === 'active_editors') {
        return {
          upsert: jest.fn(() => Promise.resolve({ data: {}, error: null })),
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              gte: jest.fn(() => Promise.resolve({ data: [], error: null }))
            }))
          }))
        }
      }
    })

    const channel = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn()
    }
    supabase.channel = jest.fn(() => channel)
    supabase.removeChannel = jest.fn()

    render(<UserPage />)

    // Should not show the "Public Page" label by default
    await waitFor(() => {
      expect(screen.queryByText('Public Page')).not.toBeInTheDocument()
    })

    // Should show collaborative editor instead of historical entries
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Start writing...')).toBeInTheDocument()
    })
  })

  test('renders header with all entries link', async () => {
    render(<UserPage />)

    await waitFor(() => {
      const allEntriesLink = screen.getByText('all entries')
      expect(allEntriesLink).toBeInTheDocument()
      expect(allEntriesLink).toHaveAttribute('href', '/testuser/all')
    })
  })

  test('shows collaboration hint only when others are active', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({
              data: [{ 
                username: 'testuser', 
                public_key: 'test-key',
                is_public: true,
                encrypted_private_key: 'encrypted',
                salt: 'salt'
              }]
            }))
          }))
        }
      }
    })

    const channel = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn((callback) => {
        callback('SUBSCRIBED')
        return channel
      })
    }
    supabase.channel = jest.fn(() => channel)
    supabase.removeChannel = jest.fn()

    render(<UserPage />)

    // Should not show collaboration hint when no active editors
    await waitFor(() => {
      expect(screen.queryByText(/other.*writing/i)).not.toBeInTheDocument()
    })
  })
})
