import handler from '../../pages/api/private-append'
import { getSupabaseAdmin } from '../../lib/supabaseAdmin'

jest.mock('../../lib/supabaseAdmin', () => ({
  getSupabaseAdmin: jest.fn()
}))

describe('/api/private-append', () => {
  let req
  let res

  beforeEach(() => {
    req = {
      method: 'POST',
      body: {
        username: 'testuser',
        clientSnapshotId: 'snapshot-1',
        encryptedContent: 'encrypted-content',
        encryptedDataKey: 'encrypted-data-key'
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
    req.body = { username: 'testuser' }

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing required fields' })
  })

  test('rejects a malformed clientSnapshotId', async () => {
    req.body = {
      username: 'testuser',
      clientSnapshotId: 'bad id!',
      encryptedContent: 'c',
      encryptedDataKey: 'k'
    }

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid clientSnapshotId' })
  })

  test('rejects an overlong clientSnapshotId', async () => {
    req.body = {
      username: 'testuser',
      clientSnapshotId: 'a'.repeat(65),
      encryptedContent: 'c',
      encryptedDataKey: 'k'
    }

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid clientSnapshotId' })
  })

  test('rejects oversized encrypted content', async () => {
    req.body = {
      username: 'testuser',
      clientSnapshotId: 'snap-1',
      encryptedContent: 'a'.repeat(3800001),
      encryptedDataKey: 'k'
    }

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(413)
    expect(res.json).toHaveBeenCalledWith({ error: 'Encrypted content too large' })
  })

  test('rejects an oversized encrypted data key', async () => {
    req.body = {
      username: 'testuser',
      clientSnapshotId: 'snap-1',
      encryptedContent: 'c',
      encryptedDataKey: 'a'.repeat(2001)
    }

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(413)
    expect(res.json).toHaveBeenCalledWith({ error: 'Encrypted data key too large' })
  })

  test('returns not found for unknown user', async () => {
    const mockMaybeSingle = jest.fn(() => Promise.resolve({ data: null, error: null }))
    const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
    const mockSelect = jest.fn(() => ({ eq: mockEq }))

    getSupabaseAdmin.mockReturnValue({
      from: jest.fn(() => ({
        select: mockSelect,
        upsert: jest.fn()
      }))
    })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' })
  })

  test('rejects appends for public users', async () => {
    const mockMaybeSingle = jest.fn(() =>
      Promise.resolve({ data: { username: 'testuser', is_public: true }, error: null })
    )
    const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
    const mockSelect = jest.fn(() => ({ eq: mockEq }))

    getSupabaseAdmin.mockReturnValue({
      from: jest.fn(() => ({
        select: mockSelect,
        upsert: jest.fn()
      }))
    })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: 'Private append is not allowed for public users' })
  })

  test('saves private snapshot for valid private user', async () => {
    const mockMaybeSingle = jest.fn(() =>
      Promise.resolve({ data: { username: 'testuser', is_public: false }, error: null })
    )
    const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
    const mockSelect = jest.fn(() => ({ eq: mockEq }))
    const mockUpsert = jest.fn(() => Promise.resolve({ error: null }))
    const mockFrom = jest.fn((table) => {
      if (table === 'users') {
        return { select: mockSelect }
      }
      if (table === 'documents') {
        return { upsert: mockUpsert }
      }
      return {}
    })

    getSupabaseAdmin.mockReturnValue({
      from: mockFrom
    })

    await handler(req, res)

    expect(mockUpsert).toHaveBeenCalledWith({
      id: 'testuser:snapshot-1',
      username: 'testuser',
      encrypted_content: 'encrypted-content',
      encrypted_data_key: 'encrypted-data-key',
      client_snapshot_id: 'snapshot-1',
      updated_at: expect.any(String),
    }, {
      onConflict: 'username,client_snapshot_id',
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true })
  })

  test('returns server error when snapshot save fails', async () => {
    const mockMaybeSingle = jest.fn(() =>
      Promise.resolve({ data: { username: 'testuser', is_public: false }, error: null })
    )
    const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
    const mockSelect = jest.fn(() => ({ eq: mockEq }))
    const mockUpsert = jest.fn(() => Promise.resolve({ error: { message: 'db failed' } }))
    const mockFrom = jest.fn((table) => {
      if (table === 'users') {
        return { select: mockSelect }
      }
      if (table === 'documents') {
        return { upsert: mockUpsert }
      }
      return {}
    })

    getSupabaseAdmin.mockReturnValue({
      from: mockFrom
    })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to save private snapshot' })
  })
})
