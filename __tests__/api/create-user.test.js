import handler from '../../pages/api/create-user'
import { getSupabaseAdmin } from '../../lib/supabaseAdmin'

jest.mock('../../lib/supabaseAdmin', () => ({
  getSupabaseAdmin: jest.fn()
}))

describe('/api/create-user', () => {
  let req
  let res

  beforeEach(() => {
    req = {
      method: 'POST',
      body: {
        username: 'newuser',
        publicKey: 'public-key',
        encryptedPrivateKey: 'encrypted-private-key',
        salt: 'salt-value',
        isPublic: false
      }
    }
    res = {
      status: jest.fn(() => res),
      json: jest.fn(() => res)
    }
    jest.clearAllMocks()
  })

  test('rejects non-POST methods', async () => {
    req.method = 'GET'

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' })
  })

  test('validates required payload fields', async () => {
    req.body = { username: '' }

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid username' })
  })

  test('returns conflict when username is already taken', async () => {
    const mockMaybeSingle = jest.fn(() => Promise.resolve({ data: { username: 'newuser' }, error: null }))
    const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
    const mockSelect = jest.fn(() => ({ eq: mockEq }))

    getSupabaseAdmin.mockReturnValue({
      from: jest.fn(() => ({
        select: mockSelect,
        insert: jest.fn()
      }))
    })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({ error: 'Username already taken' })
  })

  test('creates a new user when username is available', async () => {
    const mockMaybeSingle = jest.fn(() => Promise.resolve({ data: null, error: null }))
    const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
    const mockSelect = jest.fn(() => ({ eq: mockEq }))
    const mockInsert = jest.fn(() => Promise.resolve({ error: null }))
    const mockFrom = jest.fn(() => ({
      select: mockSelect,
      insert: mockInsert
    }))

    getSupabaseAdmin.mockReturnValue({
      from: mockFrom
    })

    await handler(req, res)

    expect(mockInsert).toHaveBeenCalledWith({
      username: 'newuser',
      public_key: 'public-key',
      encrypted_private_key: 'encrypted-private-key',
      salt: 'salt-value',
      is_public: false
    })
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({ username: 'newuser' })
  })

  test('returns conflict on insert race condition', async () => {
    const mockMaybeSingle = jest.fn(() => Promise.resolve({ data: null, error: null }))
    const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
    const mockSelect = jest.fn(() => ({ eq: mockEq }))
    const mockInsert = jest.fn(() => Promise.resolve({ error: { code: '23505' } }))

    getSupabaseAdmin.mockReturnValue({
      from: jest.fn(() => ({
        select: mockSelect,
        insert: mockInsert
      }))
    })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({ error: 'Username already taken' })
  })
})
