import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Home from '../pages/index'
import { supabase } from '../lib/supabase'
import { PublicKeyEncryption } from '../lib/publicKeyEncryption'

// Mock PublicKeyEncryption
jest.mock('../lib/publicKeyEncryption', () => ({
  PublicKeyEncryption: {
    generateAuthorKeys: jest.fn(() => Promise.resolve({
      publicKey: 'mock-public-key',
      encryptedPrivateKey: 'mock-encrypted-private-key',
      salt: 'mock-salt'
    }))
  }
}))

describe('Home Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  test('renders home page with title and form', () => {
    render(<Home />)
    
    expect(screen.getByText('Your private writing space')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('your-name')).toBeInTheDocument()
    expect(screen.getByText('Generate Random')).toBeInTheDocument()
    expect(screen.getByText('Create my space')).toBeInTheDocument()
  })

  test('updates username input when typing', async () => {
    const user = userEvent.setup()
    render(<Home />)
    
    const input = screen.getByPlaceholderText('your-name')
    await user.type(input, 'testuser')
    
    expect(input.value).toBe('testuser')
  })

  test('checks username availability when typing', async () => {
    supabase.from.mockImplementation(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
      }))
    }))
    
    const user = userEvent.setup()
    render(<Home />)
    
    const input = screen.getByPlaceholderText('your-name')
    await user.type(input, 'available')
    
    await waitFor(() => {
      expect(screen.getByText('✅ Available')).toBeInTheDocument()
    })
  })

  test('shows username as unavailable when taken', async () => {
    supabase.from.mockImplementation(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [{ username: 'taken' }], error: null }))
      }))
    }))
    
    const user = userEvent.setup()
    render(<Home />)
    
    const input = screen.getByPlaceholderText('your-name')
    await user.type(input, 'taken')
    
    await waitFor(() => {
      expect(screen.getByText('❌ Already taken')).toBeInTheDocument()
    })
  })

  test('generates random username when button clicked', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ username: 'test-username' })
    })

    const user = userEvent.setup()
    render(<Home />)

    const generateButton = screen.getByText('Generate Random')
    await user.click(generateButton)

    await waitFor(() => {
      const input = screen.getByPlaceholderText('your-name')
      expect(input.value).toBe('test-username')
    })
  })

  test('handles API errors when generating username', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'API error' })
    })

    const user = userEvent.setup()
    render(<Home />)

    const generateButton = screen.getByText('Generate Random')
    await user.click(generateButton)

    await waitFor(() => {
      const input = screen.getByPlaceholderText('your-name')
      // Should fall back to user-generated username
      expect(input.value).toMatch(/^user-\d{4}-\w{3}$/)
    })
  })

  test('retries on network errors when generating username', async () => {
    global.fetch
      .mockRejectedValueOnce(new TypeError('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ username: 'retry-success' })
      })

    const user = userEvent.setup()
    render(<Home />)

    const generateButton = screen.getByText('Generate Random')
    await user.click(generateButton)

    await waitFor(() => {
      const input = screen.getByPlaceholderText('your-name')
      expect(input.value).toBe('retry-success')
    })
  })

  test('disables submit button when username is unavailable', async () => {
    supabase.from.mockImplementation(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [{ username: 'taken' }], error: null }))
      }))
    }))
    
    const user = userEvent.setup()
    render(<Home />)
    
    const input = screen.getByPlaceholderText('your-name')
    await user.type(input, 'taken')
    
    await waitFor(() => {
      const submitButton = screen.getByText('Create my space')
      expect(submitButton).toBeDisabled()
    })
  })

  test('submits form successfully with available username', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
          })),
          upsert: jest.fn(() => Promise.resolve({ data: {}, error: null }))
        }
      }
    })
    
    const user = userEvent.setup()
    render(<Home />)
    
    const usernameInput = screen.getByPlaceholderText('your-name')
    await user.type(usernameInput, 'newuser')
    
    const passwordInput = screen.getByPlaceholderText('Enter a password')
    await user.type(passwordInput, 'SecurePassword123')
    
    await waitFor(() => {
      expect(screen.getByText('✅ Available')).toBeInTheDocument()
    })
    
    const submitButton = screen.getByText('Create my space')
    await user.click(submitButton)
    
    await waitFor(() => {
      expect(screen.getByText(/URL created: https:\/\/lekh\.space\/newuser/)).toBeInTheDocument()
    })
  })

  test('shows error message when submission fails', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
          })),
          upsert: jest.fn(() => Promise.resolve({ data: null, error: { message: 'Database error' } }))
        }
      }
    })
    
    const user = userEvent.setup()
    render(<Home />)
    
    const usernameInput = screen.getByPlaceholderText('your-name')
    await user.type(usernameInput, 'erroruser')
    
    const passwordInput = screen.getByPlaceholderText('Enter a password')
    await user.type(passwordInput, 'SecurePassword123')
    
    await waitFor(() => {
      expect(screen.getByText('✅ Available')).toBeInTheDocument()
    })
    
    const submitButton = screen.getByText('Create my space')
    await user.click(submitButton)
    
    await waitFor(() => {
      expect(screen.getByText('Error: Database error')).toBeInTheDocument()
    })
  })

  test('validates username pattern with invalid characters', async () => {
    const user = userEvent.setup()
    render(<Home />)
    
    const input = screen.getByPlaceholderText('your-name')
    
    // The input has pattern validation, so invalid characters should be handled by the browser
    expect(input).toHaveAttribute('pattern', '[a-zA-Z0-9_\\-]+')
    expect(input).toHaveAttribute('title', 'Only letters, numbers, hyphens, and underscores allowed')
  })

  test('shows public flow when secondary action clicked', async () => {
    const user = userEvent.setup()
    render(<Home />)

    // Should start with private flow
    expect(screen.getByPlaceholderText('Enter a password')).toBeInTheDocument()

    // Click the secondary action to switch to public flow
    const publicButton = screen.getByText('Create a shared writing space →')
    await user.click(publicButton)

    // Password field should be hidden in public flow
    expect(screen.queryByPlaceholderText('Enter a password')).not.toBeInTheDocument()
    expect(screen.getByText('Create a shared writing space')).toBeInTheDocument()
  })

  test('allows creating public page without password', async () => {
    const mockUpsert = jest.fn(() => Promise.resolve({ data: {}, error: null }))
    supabase.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ data: [], error: null })) })),
          upsert: mockUpsert
        }
      }
    })

    const user = userEvent.setup()
    render(<Home />)

    // Switch to public flow
    const publicButton = screen.getByText('Create a shared writing space →')
    await user.click(publicButton)

    const usernameInput = screen.getByPlaceholderText('your-name')
    await user.type(usernameInput, 'publicuser')

    await waitFor(() => {
      expect(screen.getByText('✅ Available')).toBeInTheDocument()
    })

    const submitButton = screen.getByText('Create shared space')
    await user.click(submitButton)

    await waitFor(() => {
      expect(PublicKeyEncryption.generateAuthorKeys).toHaveBeenCalledWith('publicuser', expect.any(Uint8Array))
      expect(mockUpsert).toHaveBeenCalledWith({
        username: 'publicuser',
        public_key: 'mock-public-key',
        encrypted_private_key: 'mock-encrypted-private-key',
        salt: 'mock-salt',
        is_public: true
      })
      expect(screen.getByText(/URL created: https:\/\/lekh\.space\/publicuser/)).toBeInTheDocument()
    })
  })
})