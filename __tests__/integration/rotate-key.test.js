/**
 * @jest-environment node
 */

// Real WebCrypto (no mocks): proves a password change keeps old entries readable
// and that the server challenge only verifies for the holder of the private key.
import { webcrypto } from 'crypto'
import { PublicKeyEncryption } from '../../lib/publicKeyEncryption'
import { createChallenge, verifyChallenge } from '../../lib/rotateChallenge'

const OLD_PASSWORD = 'qwe123'
const NEW_PASSWORD = 'correct horse battery staple'

describe('password change (key rotation) with real crypto', () => {
  let realCrypto
  let original
  let account
  let documents

  beforeAll(async () => {
    realCrypto = webcrypto
    original = Object.getOwnPropertyDescriptor(global, 'crypto')
    Object.defineProperty(global, 'crypto', { value: realCrypto, configurable: true, writable: true })
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret'

    const salt = realCrypto.getRandomValues(new Uint8Array(16))
    account = await PublicKeyEncryption.generateAuthorKeys(OLD_PASSWORD, salt)

    documents = []
    for (const [id, text] of [['a', 'first entry'], ['b', 'second entry']]) {
      const { encryptedContent, encryptedDataKey } = await PublicKeyEncryption.encrypt(text, account.publicKey)
      documents.push({ id, text, encrypted_content: encryptedContent, encrypted_data_key: encryptedDataKey })
    }
  })

  afterAll(() => {
    if (original) Object.defineProperty(global, 'crypto', original)
  })

  test('old entries stay readable with the new password, and the old password stops working', async () => {
    const oldPrivateKey = await PublicKeyEncryption.unlockPrivateKey(
      OLD_PASSWORD, account.encryptedPrivateKey, account.salt
    )
    const rotation = await PublicKeyEncryption.prepareRotation({
      oldPrivateKey,
      newPassword: NEW_PASSWORD,
      documents: [...documents, { id: 'junk', encrypted_data_key: 'bm90IGEga2V5' }],
    })

    expect(rotation.publicKey).not.toBe(account.publicKey)
    expect(rotation.skipped).toBe(1)
    expect(rotation.dataKeys.junk.new).toBe('bm90IGEga2V5')

    for (const doc of documents) {
      const text = await PublicKeyEncryption.decrypt(
        doc.encrypted_content,
        rotation.dataKeys[doc.id].new,
        NEW_PASSWORD,
        rotation.encryptedPrivateKey,
        rotation.salt
      )
      expect(text).toBe(doc.text)
    }

    // old_hash must equal what Postgres computes: sha256 hex of the stored key text.
    for (const doc of documents) {
      const expected = require('crypto').createHash('sha256').update(doc.encrypted_data_key).digest('hex')
      expect(rotation.dataKeys[doc.id].old_hash).toBe(expected)
    }

    await expect(
      PublicKeyEncryption.unlockPrivateKey(OLD_PASSWORD, rotation.encryptedPrivateKey, rotation.salt)
    ).rejects.toThrow()

    // New entries are encrypted to the new key, which the old private key cannot read.
    const fresh = await PublicKeyEncryption.encrypt('after rotation', rotation.publicKey)
    await expect(
      PublicKeyEncryption.decryptBase64WithPrivateKey(oldPrivateKey, fresh.encryptedDataKey)
    ).rejects.toThrow()
  })

  test('a wrong current password cannot unlock the private key', async () => {
    await expect(
      PublicKeyEncryption.unlockPrivateKey('wrong-password', account.encryptedPrivateKey, account.salt)
    ).rejects.toThrow()
  })

  describe('challenge', () => {
    test('verifies only for the holder of the private key, the right user and a fresh token', async () => {
      const privateKey = await PublicKeyEncryption.unlockPrivateKey(
        OLD_PASSWORD, account.encryptedPrivateKey, account.salt
      )
      const { encryptedChallenge, token } = createChallenge('alice', account.publicKey)
      const nonce = await PublicKeyEncryption.decryptBase64WithPrivateKey(privateKey, encryptedChallenge)
      const base = { token, nonceBase64: nonce, username: 'alice', publicKeyBase64: account.publicKey }

      expect(verifyChallenge(base)).toBe(true)
      expect(verifyChallenge({ ...base, username: 'bob' })).toBe(false)
      expect(verifyChallenge({ ...base, nonceBase64: Buffer.from('guess').toString('base64') })).toBe(false)
      expect(verifyChallenge({ ...base, token: token.slice(0, -2) + 'xx' })).toBe(false)
      expect(verifyChallenge({ ...base, now: Date.now() + 3 * 60 * 1000 })).toBe(false)
    })

    test('a token is useless once the key has been rotated', async () => {
      const privateKey = await PublicKeyEncryption.unlockPrivateKey(
        OLD_PASSWORD, account.encryptedPrivateKey, account.salt
      )
      const { encryptedChallenge, token } = createChallenge('alice', account.publicKey)
      const nonce = await PublicKeyEncryption.decryptBase64WithPrivateKey(privateKey, encryptedChallenge)
      const rotated = await PublicKeyEncryption.generateAuthorKeys(NEW_PASSWORD, new Uint8Array(16))

      expect(
        verifyChallenge({ token, nonceBase64: nonce, username: 'alice', publicKeyBase64: rotated.publicKey })
      ).toBe(false)
    })
  })
})
