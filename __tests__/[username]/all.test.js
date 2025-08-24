import { render, screen, waitFor } from '@testing-library/react'
import { supabase } from '../../lib/supabase'
import AllEntriesPage from '../../pages/[username]/all'

// Mock the router with different scenarios
const mockPush = jest.fn()
const mockRouter = {
  query: { username: 'testuser' },
  push: mockPush,
}

jest.mock('next/router', () => ({
  useRouter: () => mockRouter
}))

// Mock sample entries data
const mockEntries = [
  {
    id: 'entry-1',
    username: 'testuser',
    content: 'This is my first entry with some content.',
    created_at: '2023-01-01T10:00:00Z',
    updated_at: '2023-01-01T10:00:00Z'
  },
  {
    id: 'entry-2',
    username: 'testuser',
    content: 'Another entry with different content.\nThis one has multiple lines.',
    created_at: '2023-01-02T15:30:00Z',
    updated_at: '2023-01-02T15:30:00Z'
  },
  {
    id: 'entry-3',
    username: 'testuser',
    content: 'Latest entry should appear first.',
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
            eq: jest.fn(() => Promise.resolve({ data: [{ username: 'testuser' }], error: null }))
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
    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(screen.getByText('testuser - All Entries')).toBeInTheDocument()
      expect(screen.getByText('← Back to write')).toBeInTheDocument()
    })

    // Check that all entries are displayed
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
      expect(screen.getByText('testuser - All Entries')).toBeInTheDocument()
      expect(screen.getByText('No entries found for testuser')).toBeInTheDocument()
    })
  })

  test('displays entries with formatted timestamps', async () => {
    render(<AllEntriesPage />)

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
      expect(mockSelect).toHaveBeenCalledWith('*')
      expect(mockEq).toHaveBeenCalledWith('username', 'testuser')
      expect(mockOrder).toHaveBeenCalledWith('updated_at', { ascending: false })
    })
  })

  test('back link has correct href', async () => {
    render(<AllEntriesPage />)

    await waitFor(() => {
      const backLink = screen.getByText('← Back to write')
      expect(backLink.closest('a')).toHaveAttribute('href', '/testuser')
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
      expect(screen.getByText('anotheruser - All Entries')).toBeInTheDocument()
      expect(screen.getByText('No entries found for anotheruser')).toBeInTheDocument()
    })

    const backLink = screen.getByText('← Back to write')
    expect(backLink.closest('a')).toHaveAttribute('href', '/anotheruser')
  })

  test('preserves whitespace and line breaks in entry content', async () => {
    const entryWithFormatting = {
      id: 'formatted-entry',
      username: 'testuser',
      content: 'Line 1\nLine 2\n\nLine 4 with spaces   ',
      created_at: '2023-01-01T10:00:00Z',
      updated_at: '2023-01-01T10:00:00Z'
    }

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
              order: jest.fn(() => Promise.resolve({ data: [entryWithFormatting], error: null }))
            }))
          }))
        }
      }
    })

    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(screen.getByText('testuser - All Entries')).toBeInTheDocument()
    })

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
      expect(screen.getByText('testuser - All Entries')).toBeInTheDocument()
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
      expect(screen.getByText('testuser - All Entries')).toBeInTheDocument()
    })

    // Check that dark mode CSS variables are applied
    expect(document.head.innerHTML).toContain('@media(prefers-color-scheme:dark)')
  })

  test('entry dates are properly formatted and displayed', async () => {
    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(screen.getByText('testuser - All Entries')).toBeInTheDocument()
    })

    await waitFor(() => {
      // Check that timestamps are formatted and displayed
      const timestamps = screen.getAllByText(/\d{1,2}\/\d{1,2}\/\d{4}/)
      expect(timestamps.length).toBeGreaterThan(0)
    })
  })

  test('entries are displayed with proper styling and structure', async () => {
    render(<AllEntriesPage />)

    await waitFor(() => {
      expect(screen.getByText('testuser - All Entries')).toBeInTheDocument()
    })

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