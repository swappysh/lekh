import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Home from '../pages/index'
import { supabase } from '../lib/supabase'

// Mock the random-words library
jest.mock('random-words', () => ({
  generate: jest.fn(() => ['test', 'username'])
}))

describe('Home Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders home page with title and form', () => {
    render(<Home />)
    
    expect(screen.getByText('Create Your Writing URL')).toBeInTheDocument()
    expect(screen.getByText('Create a personalized URL where you can write and save your content.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('your-username')).toBeInTheDocument()
    expect(screen.getByText('Generate Random')).toBeInTheDocument()
    expect(screen.getByText('Create URL')).toBeInTheDocument()
  })

  test('updates username input when typing', async () => {
    const user = userEvent.setup()
    render(<Home />)
    
    const input = screen.getByPlaceholderText('your-username')
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
    
    const input = screen.getByPlaceholderText('your-username')
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
    
    const input = screen.getByPlaceholderText('your-username')
    await user.type(input, 'taken')
    
    await waitFor(() => {
      expect(screen.getByText('❌ Already taken')).toBeInTheDocument()
    })
  })

  test('generates random username when button clicked', async () => {
    const user = userEvent.setup()
    render(<Home />)
    
    const generateButton = screen.getByText('Generate Random')
    await user.click(generateButton)
    
    const input = screen.getByPlaceholderText('your-username')
    expect(input.value).toBe('test-username')
  })

  test('disables submit button when username is unavailable', async () => {
    supabase.from.mockImplementation(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [{ username: 'taken' }], error: null }))
      }))
    }))
    
    const user = userEvent.setup()
    render(<Home />)
    
    const input = screen.getByPlaceholderText('your-username')
    await user.type(input, 'taken')
    
    await waitFor(() => {
      const submitButton = screen.getByText('Create URL')
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
    
    const input = screen.getByPlaceholderText('your-username')
    await user.type(input, 'newuser')
    
    await waitFor(() => {
      expect(screen.getByText('✅ Available')).toBeInTheDocument()
    })
    
    const submitButton = screen.getByText('Create URL')
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
    
    const input = screen.getByPlaceholderText('your-username')
    await user.type(input, 'erroruser')
    
    await waitFor(() => {
      expect(screen.getByText('✅ Available')).toBeInTheDocument()
    })
    
    const submitButton = screen.getByText('Create URL')
    await user.click(submitButton)
    
    await waitFor(() => {
      expect(screen.getByText('Error: Database error')).toBeInTheDocument()
    })
  })

  test('validates username pattern with invalid characters', async () => {
    const user = userEvent.setup()
    render(<Home />)
    
    const input = screen.getByPlaceholderText('your-username')
    
    // The input has pattern validation, so invalid characters should be handled by the browser
    expect(input).toHaveAttribute('pattern', '[a-zA-Z0-9_\\-]+')
    expect(input).toHaveAttribute('title', 'Only letters, numbers, hyphens, and underscores allowed')
  })
})