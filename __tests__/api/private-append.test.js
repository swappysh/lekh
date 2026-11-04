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
        encryptedDataKey: 'encrypted-data-key',
        publicKey: 'current-public-key'
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
      encryptedDataKey: 'k',
      publicKey: 'current-public-key'
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
      encryptedDataKey: 'k',
      publicKey: 'current-public-key'
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
      encryptedDataKey: 'k',
      publicKey: 'current-public-key'
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
      encryptedDataKey: 'a'.repeat(2001),
      publicKey: 'current-public-key'
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
        select: mockSelect
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
        select: mockSelect
      }))
    })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: 'Private append is not allowed for public users' })
  })

  function mockPrivateUser(rpc) {
    const mockMaybeSingle = jest.fn(() =>
      Promise.resolve({ data: { username: 'testuser', is_public: false }, error: null })
    )
    const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
    const mockSelect = jest.fn(() => ({ eq: mockEq }))
    getSupabaseAdmin.mockReturnValue({
      from: jest.fn(() => ({ select: mockSelect })),
      rpc,
    })
  }

  test('saves private snapshot through private_append for a valid private user', async () => {
    const mockRpc = jest.fn(() => Promise.resolve({ error: null }))
    mockPrivateUser(mockRpc)

    await handler(req, res)

    expect(mockRpc).toHaveBeenCalledWith('private_append', {
      p_username: 'testuser',
      p_public_key: 'current-public-key',
      p_client_snapshot_id: 'snapshot-1',
      p_encrypted_content: 'encrypted-content',
      p_encrypted_data_key: 'encrypted-data-key',
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true })
  })

  test('returns server error when snapshot save fails', async () => {
    mockPrivateUser(jest.fn(() => Promise.resolve({ error: { message: 'db failed' } })))

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to save private snapshot' })
  })

  test('maps a key mismatch raised inside the transaction to 409', async () => {
    mockPrivateUser(jest.fn(() => Promise.resolve({ error: { message: 'key changed' } })))

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({ error: 'Encryption key changed, reload the page' })
  })

  test('requires the client public key', async () => {
    delete req.body.publicKey

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing required fields' })
  })
})
