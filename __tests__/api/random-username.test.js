import handler from '../../pages/api/random-username'
import { supabase } from '../../lib/supabase'
import { generate } from 'random-words'

// Mock dependencies
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn()
  }
}))

jest.mock('random-words', () => ({
  generate: jest.fn()
}))

describe('/api/random-username', () => {
  let req, res

  beforeEach(() => {
    req = { method: 'GET' }
    res = {
      status: jest.fn(() => res),
      json: jest.fn(() => res)
    }
    jest.clearAllMocks()
  })

  test('returns unique username when available', async () => {
    generate.mockReturnValue(['test', 'username'])
    supabase.from.mockReturnValue({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
      }))
    })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ username: 'test-username' })
  })

  test('retries when username is taken and finds available one', async () => {
    generate
      .mockReturnValueOnce(['taken', 'name'])
      .mockReturnValueOnce(['available', 'name'])
    
    supabase.from
      .mockReturnValueOnce({
        select: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ data: [{ username: 'taken-name' }], error: null }))
        }))
      })
      .mockReturnValueOnce({
        select: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ username: 'available-name' })
  })

  test('returns fallback username after max attempts', async () => {
    generate.mockReturnValue(['taken', 'name'])
    supabase.from.mockReturnValue({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [{ username: 'taken-name' }], error: null }))
      }))
    })

    // Mock Date.now and Math.random for predictable fallback
    const mockDate = jest.spyOn(Date, 'now').mockReturnValue(1234567890000)
    const mockMath = jest.spyOn(Math, 'random').mockReturnValue(0.123456789)

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const call = res.json.mock.calls[0][0]
    expect(call.username).toMatch(/^taken-name-\d{4}-[a-z0-9]{2}$/)

    mockDate.mockRestore()
    mockMath.mockRestore()
  })

  test('handles database errors gracefully', async () => {
    generate.mockReturnValue(['test', 'username'])
    supabase.from.mockReturnValue({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: null, error: { message: 'Database error' } }))
      }))
    })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Database error occurred' })
  })

  test('rejects non-GET methods', async () => {
    req.method = 'POST'

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' })
  })

  test('handles unexpected errors', async () => {
    generate.mockImplementation(() => {
      throw new Error('Unexpected error')
    })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
  })

  test('validates username format', async () => {
    generate.mockReturnValue(['test', 'username'])
    supabase.from.mockReturnValue({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
      }))
    })

    await handler(req, res)

    const call = res.json.mock.calls[0][0]
    expect(call.username).toMatch(/^[a-z]+-[a-z]+$/)
  })
})