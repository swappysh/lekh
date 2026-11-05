import { webcrypto } from 'crypto'
import handler from '../../pages/api/private-delete'
import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import { PublicKeyEncryption } from '../../lib/publicKeyEncryption'
import { createChallenge, DELETE_ACTION } from '../../lib/rotateChallenge'

jest.mock('../../lib/supabaseAdmin', () => ({
  getSupabaseAdmin: jest.fn()
}))

describe('/api/private-delete', () => {
  let req
  let res
  let user
  let realKeys
  let privateKey
  let deleteSpy
  let deleteEqs
  let deleteResult

  const mockAdmin = () => {
    deleteEqs = []
    deleteSpy = jest.fn()
    const documents = {
      delete: () => {
        deleteSpy()
        const chain = {
          eq: (column, value) => {
            deleteEqs.push([column, value])
            return deleteEqs.length === 2 ? Promise.resolve(deleteResult) : chain
          }
        }
        return chain
      }
    }
    const users = {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: user, error: null }) }) })
    }
    getSupabaseAdmin.mockReturnValue({
      from: jest.fn((table) => (table === 'users' ? users : documents))
    })
  }

  beforeAll(async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret'
    const originalCrypto = global.crypto
    Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true, writable: true })
    realKeys = await PublicKeyEncryption.generateAuthorKeys('pw-for-test', new Uint8Array(16))
    privateKey = await PublicKeyEncryption.unlockPrivateKey('pw-for-test', realKeys.encryptedPrivateKey, realKeys.salt)
    global.__originalCrypto = originalCrypto
  })

  afterAll(() => {
    Object.defineProperty(global, 'crypto', { value: global.__originalCrypto, configurable: true, writable: true })
  })

  beforeEach(() => {
    user = { username: 'alice', public_key: realKeys.publicKey, is_public: false }
    deleteResult = { error: null }
    res = { status: jest.fn(() => res), json: jest.fn(() => res) }
    req = { method: 'POST', body: { step: 'challenge', username: 'alice' } }
    jest.clearAllMocks()
    mockAdmin()
  })

  // Solve a challenge the way the owner's browser does: decrypt the nonce with the private key.
  const commitBody = async (overrides = {}, action = DELETE_ACTION) => {
    const { encryptedChallenge, token } = createChallenge('alice', realKeys.publicKey, Date.now(), action)
    const nonce = await PublicKeyEncryption.decryptBase64WithPrivateKey(privateKey, encryptedChallenge)
    return {
      step: 'commit',
      username: 'alice',
      clientSnapshotId: 'snap-1',
      token,
      challengeResponse: nonce,
      ...overrides
    }
  }

  test.each(['GET', 'DELETE', 'PUT'])('rejects %s', async (method) => {
    req.method = method

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  test('does not delete for an anonymous request with no proof', async () => {
    req.body = { step: 'commit', username: 'alice', clientSnapshotId: 'snap-1' }

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  test('the old unauthenticated body no longer deletes', async () => {
    req.body = { username: 'alice', clientSnapshotId: 'snap-1' }

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  test('rejects an invalid username', async () => {
    req.body = { step: 'challenge', username: 'bad name!' }

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid username' })
  })

  test('rejects an invalid snapshot id on commit', async () => {
    req.body = await commitBody({ clientSnapshotId: 'bad id!' })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid clientSnapshotId' })
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  test('challenge step returns an encrypted nonce and a token', async () => {
    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedChallenge: expect.any(String), token: expect.any(String) })
    )
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  test('challenge step 404s for an unknown user', async () => {
    user = null

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  test('challenge step 403s for a public user', async () => {
    user.is_public = true

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  test('deletes by username and snapshot id when the caller proves key ownership', async () => {
    req.body = await commitBody()

    await handler(req, res)

    expect(deleteEqs).toEqual([['username', 'alice'], ['client_snapshot_id', 'snap-1']])
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true })
  })

  test('refuses a guessed nonce', async () => {
    req.body = await commitBody({ challengeResponse: Buffer.from('guess').toString('base64') })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  test('refuses a token minted for another username', async () => {
    const mine = await commitBody()
    user = { username: 'bob', public_key: realKeys.publicKey, is_public: false }
    req.body = { ...mine, username: 'bob' }

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  test('refuses a password-change (rotate) token', async () => {
    req.body = await commitBody({}, 'rotate')

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  test('returns server error when delete fails', async () => {
    deleteResult = { error: { message: 'db failed' } }
    req.body = await commitBody()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Failed to delete snapshot' })
    )
  })
})
