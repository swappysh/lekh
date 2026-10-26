import handler from '../../pages/api/private-delete'
import { getSupabaseAdmin } from '../../lib/supabaseAdmin'

jest.mock('../../lib/supabaseAdmin', () => ({
  getSupabaseAdmin: jest.fn()
}))

function mockDeleteResult(result) {
  const eq2 = jest.fn(() => Promise.resolve(result))
  const eq1 = jest.fn(() => ({ eq: eq2 }))
  const del = jest.fn(() => ({ eq: eq1 }))
  getSupabaseAdmin.mockReturnValue({
    from: jest.fn(() => ({ delete: del }))
  })
  return { del, eq1, eq2 }
}

describe('/api/private-delete', () => {
  let req
  let res

  beforeEach(() => {
    req = {
      method: 'POST',
      body: { username: 'testuser', clientSnapshotId: 'snap-1' },
      query: {}
    }
    res = {
      status: jest.fn(() => res),
      json: jest.fn(() => res)
    }
    jest.clearAllMocks()
  })

  test('rejects unsupported methods', async () => {
    req.method = 'GET'

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' })
  })

  test('validates required fields', async () => {
    req.body = { username: 'testuser' }

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid clientSnapshotId' })
  })

  test('rejects an invalid snapshot id', async () => {
    req.body = { username: 'testuser', clientSnapshotId: 'bad id!' }

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid clientSnapshotId' })
  })

  test('deletes by username and snapshot id', async () => {
    const { eq1, eq2 } = mockDeleteResult({ error: null })

    await handler(req, res)

    expect(eq1).toHaveBeenCalledWith('username', 'testuser')
    expect(eq2).toHaveBeenCalledWith('client_snapshot_id', 'snap-1')
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true })
  })

  test('reads params from the query string on DELETE', async () => {
    req.method = 'DELETE'
    req.body = {}
    req.query = { username: 'testuser', clientSnapshotId: 'snap-1' }
    const { eq1 } = mockDeleteResult({ error: null })

    await handler(req, res)

    expect(eq1).toHaveBeenCalledWith('username', 'testuser')
    expect(res.status).toHaveBeenCalledWith(200)
  })

  test('returns server error when delete fails', async () => {
    mockDeleteResult({ error: { message: 'db failed' } })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Failed to delete snapshot', detail: 'db failed' })
    )
  })
})
