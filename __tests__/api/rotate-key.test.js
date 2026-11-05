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

  const mockAdmin = () => {
    const maybeSingle = jest.fn(() => Promise.resolve({ data: user, error: null }))
    rpc = jest.fn(() => Promise.resolve({ error: null }))
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
    req = { method: 'POST', body: { step: 'challenge', username: 'alice' } }
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
    expect(rpc).not.toHaveBeenCalled()
  })

  test('refuses a token minted for the delete action', async () => {
    const { encryptedChallenge, token } = createChallenge('alice', realKeys.publicKey, Date.now(), DELETE_ACTION)
    const nonce = await PublicKeyEncryption.decryptBase64WithPrivateKey(global.__priv, encryptedChallenge)
    req.body = { ...(await commitBody()), token, challengeResponse: nonce }
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('refuses a forged token', async () => {
    const body = await commitBody()
    req.body = { ...body, token: body.token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')) }
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('refuses an expired token', async () => {
    const { encryptedChallenge, token } = createChallenge('alice', realKeys.publicKey, Date.now() - 10 * 60 * 1000, ROTATE_ACTION)
    const nonce = await PublicKeyEncryption.decryptBase64WithPrivateKey(global.__priv, encryptedChallenge)
    req.body = { ...(await commitBody()), token, challengeResponse: nonce }
    await handler(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(rpc).not.toHaveBeenCalled()
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
    rpc.mockResolvedValueOnce({ error: { message: 'entries changed' } })
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
    expect(rpc).not.toHaveBeenCalled()
  })
})
