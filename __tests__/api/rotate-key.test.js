import { webcrypto } from 'crypto'
import handler from '../../pages/api/rotate-key'
import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import { PublicKeyEncryption } from '../../lib/publicKeyEncryption'
import { createChallenge, ROTATE_ACTION, DELETE_ACTION } from '../../lib/rotateChallenge'

jest.mock('../../lib/supabaseAdmin', () => ({
  getSupabaseAdmin: jest.fn()
}))

describe('/api/rotate-key', () => {
  let req
  let res
  let rpc
  let user
  let realKeys
  let nonce

  // rpc answers rate_limit_hit (seconds to wait, 0 = allowed) and rotate_user_key separately
  const rpcAnswers = (limiter, rotation = { error: null }) => (name) =>
    Promise.resolve(name === 'rate_limit_hit' ? limiter : rotation)

  const mockAdmin = () => {
    const maybeSingle = jest.fn(() => Promise.resolve({ data: user, error: null }))
    rpc = jest.fn(rpcAnswers({ data: 0, error: null }))
    getSupabaseAdmin.mockReturnValue({
      from: jest.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
      rpc
    })
  }

  beforeAll(async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret'
    const originalCrypto = global.crypto
    Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true, writable: true })
    realKeys = await PublicKeyEncryption.generateAuthorKeys('pw-for-test', new Uint8Array(16))
    const priv = await PublicKeyEncryption.unlockPrivateKey('pw-for-test', realKeys.encryptedPrivateKey, realKeys.salt)
    global.__priv = priv
    global.__originalCrypto = originalCrypto
  })

  afterAll(() => {
    Object.defineProperty(global, 'crypto', { value: global.__originalCrypto, configurable: true, writable: true })
  })

  beforeEach(async () => {
    user = { username: 'alice', public_key: realKeys.publicKey, is_public: false }
    res = { status: jest.fn(() => res), json: jest.fn(() => res) }
    req = { method: 'POST', headers: { 'x-real-ip': '203.0.113.7' }, body: { step: 'challenge', username: 'alice' } }
    res.setHeader = jest.fn()
    mockAdmin()
  })

  const commitBody = async () => {
    const { encryptedChallenge, token } = createChallenge('alice', realKeys.publicKey, Date.now(), ROTATE_ACTION)
    nonce = await PublicKeyEncryption.decryptBase64WithPrivateKey(global.__priv, encryptedChallenge)
    return {
      step: 'commit',
      username: 'alice',
      token,
      challengeResponse: nonce,
      publicKey: 'new-public-key',
      encryptedPrivateKey: 'new-encrypted-private-key',
      salt: 'new-salt',
      dataKeys: { 'alice:1': { old_hash: 'a'.repeat(64), new: 'rewrapped-1' } }
    }
  }

  test('rejects non-POST', async () => {
    req.method = 'GET'
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(405)
  })

  test('rejects unknown step', async () => {
    req.body.step = 'nope'
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  test('refuses public users', async () => {
    user.is_public = true
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  test('challenge step returns an encrypted nonce and a token', async () => {
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
    const payload = res.json.mock.calls[0][0]
    expect(payload.encryptedChallenge).toEqual(expect.any(String))
    expect(payload.token).toContain('.')
  })

  test('commit without a valid challenge answer is rejected and nothing is rotated', async () => {
    req.body = { ...(await commitBody()), challengeResponse: Buffer.from('guess').toString('base64') }
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(rpc).not.toHaveBeenCalledWith('rotate_user_key', expect.anything())
  })

  test('refuses a token minted for the delete action', async () => {
    const { encryptedChallenge, token } = createChallenge('alice', realKeys.publicKey, Date.now(), DELETE_ACTION)
    const nonce = await PublicKeyEncryption.decryptBase64WithPrivateKey(global.__priv, encryptedChallenge)
    req.body = { ...(await commitBody()), token, challengeResponse: nonce }
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(rpc).not.toHaveBeenCalledWith('rotate_user_key', expect.anything())
  })

  test('refuses a forged token', async () => {
    const body = await commitBody()
    req.body = { ...body, token: body.token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')) }
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(rpc).not.toHaveBeenCalledWith('rotate_user_key', expect.anything())
  })

  test('refuses an expired token', async () => {
    const { encryptedChallenge, token } = createChallenge('alice', realKeys.publicKey, Date.now() - 10 * 60 * 1000, ROTATE_ACTION)
    const nonce = await PublicKeyEncryption.decryptBase64WithPrivateKey(global.__priv, encryptedChallenge)
    req.body = { ...(await commitBody()), token, challengeResponse: nonce }
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(rpc).not.toHaveBeenCalledWith('rotate_user_key', expect.anything())
  })

  test('commit with the decrypted challenge rotates through the SQL function', async () => {
    req.body = await commitBody()
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(rpc).toHaveBeenCalledWith('rotate_user_key', {
      p_username: 'alice',
      p_old_public_key: realKeys.publicKey,
      p_new_public_key: 'new-public-key',
      p_encrypted_private_key: 'new-encrypted-private-key',
      p_salt: 'new-salt',
      p_doc_keys: { 'alice:1': { old_hash: 'a'.repeat(64), new: 'rewrapped-1' } }
    })
  })

  test('maps an entries-changed failure to 409', async () => {
    req.body = await commitBody()
    rpc.mockImplementation(rpcAnswers({ data: 0, error: null }, { error: { message: 'entries changed' } }))
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(409)
  })

  test.each([
    ['a bare number', 42],
    ['a bare string (old format)', 'rewrapped-1'],
    ['a missing old_hash', { new: 'rewrapped-1' }],
    ['a non-hex old_hash', { old_hash: 'z'.repeat(64), new: 'rewrapped-1' }],
    ['an empty new key', { old_hash: 'a'.repeat(64), new: '' }],
  ])('rejects malformed dataKeys: %s', async (_label, entry) => {
    req.body = { ...(await commitBody()), dataKeys: { 'alice:1': entry } }
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(rpc).not.toHaveBeenCalledWith('rotate_user_key', expect.anything())
  })

  describe('rate limiting', () => {
    let consoleError

    beforeEach(() => {
      consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleError.mockRestore()
    })

    test('counts each request against the client IP', async () => {
      await handler(req, res)
      expect(rpc).toHaveBeenCalledWith('rate_limit_hit', {
        p_key: 'rotate-key:203.0.113.7',
        p_limit: 12,
        p_window_seconds: 600
      })
    })

    test('answers 429 with Retry-After and does no other work once over the limit', async () => {
      rpc.mockImplementation(rpcAnswers({ data: 421, error: null }))
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(429)
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '421')
      expect(rpc).toHaveBeenCalledTimes(1)
    })

    test('passes a one second wait through as Retry-After: 1', async () => {
      rpc.mockImplementation(rpcAnswers({ data: 1, error: null }))
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(429)
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '1')
    })

    test('a commit over the limit never reaches the rotation', async () => {
      req.body = await commitBody()
      rpc.mockImplementation(rpcAnswers({ data: 30, error: null }))
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(429)
      expect(rpc).not.toHaveBeenCalledWith('rotate_user_key', expect.anything())
    })

    test('limits requests for an unknown username too, so usernames cannot be probed freely', async () => {
      user = null
      rpc.mockImplementation(rpcAnswers({ data: 421, error: null }))
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(429)
    })

    test.each([
      ['an invalid username', { step: 'challenge', username: 'bad name!' }],
      ['an unknown step', { step: 'nope', username: 'alice' }],
    ])('rejects %s with 400 before touching the counter', async (_label, body) => {
      req.body = body
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(rpc).not.toHaveBeenCalled()
    })

    test('allows the request when the limiter itself errors', async () => {
      rpc.mockImplementation(rpcAnswers({ data: null, error: { message: 'boom' } }))
      await handler(req, res)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(consoleError).toHaveBeenCalled()
    })
  })
})
