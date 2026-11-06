import { createHash } from 'crypto'
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
      p_writer_hash: null,
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

  const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'

  test('passes only the sha256 of the writer token to the database', async () => {
    const mockRpc = jest.fn(() => Promise.resolve({ error: null }))
    mockPrivateUser(mockRpc)
    req.body.writerToken = TOKEN

    await handler(req, res)

    const args = mockRpc.mock.calls[0][1]
    expect(args.p_writer_hash).toBe(createHash('sha256').update(TOKEN).digest('hex'))
    expect(JSON.stringify(args)).not.toContain(TOKEN)
    expect(res.status).toHaveBeenCalledWith(200)
  })

  test.each(['a'.repeat(22), 'a'.repeat(128)])('accepts a writer token at the length bounds %#', async (token) => {
    const mockRpc = jest.fn(() => Promise.resolve({ error: null }))
    mockPrivateUser(mockRpc)
    req.body.writerToken = token

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(mockRpc).toHaveBeenCalled()
  })

  test.each(['short', 'a'.repeat(21), 'has spaces in it and is long enough!!', 'a'.repeat(129), {}])(
    'rejects a malformed writer token %#',
    async (token) => {
      const mockRpc = jest.fn()
      mockPrivateUser(mockRpc)
      req.body.writerToken = token

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid writerToken' })
      expect(mockRpc).not.toHaveBeenCalled()
    }
  )

  test('maps a snapshot owned by another writer to 403', async () => {
    mockPrivateUser(jest.fn(() => Promise.resolve({ error: { message: 'not the writer' } })))
    req.body.writerToken = TOKEN

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: 'Snapshot belongs to another writer', code: 'not_writer' })
  })
})
