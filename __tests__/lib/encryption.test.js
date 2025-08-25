/**
 * @jest-environment jsdom
 */

import { decryptContent, deriveKey, encryptContent, generateSalt } from '../../lib/encryption'

// Use the global crypto mock from jest.setup.js - just ensure it's available
if (!global.crypto?.subtle) {
  throw new Error('Crypto mocks not properly set up')
}

describe('Encryption Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('generateSalt', () => {
    it('should generate a 32-character hex salt', async () => {
      const salt = await generateSalt()

      expect(salt).toBeDefined()
      expect(typeof salt).toBe('string')
      expect(salt.length).toBe(32) // 16 bytes * 2 hex chars
      expect(salt).toMatch(/^[0-9a-f]{32}$/) // Only hex characters
    })

    it('should generate unique salts', async () => {
      const salt1 = await generateSalt()
      const salt2 = await generateSalt()

      expect(salt1).not.toBe(salt2)
    })
  })

  describe('deriveKey', () => {
    it('should derive key using PBKDF2', async () => {
      const password = 'test-password'
      const salt = 'abcd1234567890abcd1234567890abcd'

      await deriveKey(password, salt)

      expect(crypto.subtle.importKey).toHaveBeenCalledWith(
        'raw',
        expect.any(Uint8Array),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      )

      expect(crypto.subtle.deriveKey).toHaveBeenCalledWith(
        {
          name: 'PBKDF2',
          salt: expect.any(Uint8Array),
          iterations: 100000,
          hash: 'SHA-256',
        },
        expect.any(Object),
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      )
    })

    it('should handle hex salt conversion correctly', async () => {
      const password = 'test-password'
      const salt = 'abcd1234'

      await deriveKey(password, salt)

      const saltBuffer = new Uint8Array([0xab, 0xcd, 0x12, 0x34])
      expect(crypto.subtle.deriveKey).toHaveBeenCalledWith(
        expect.objectContaining({
          salt: saltBuffer
        }),
        expect.any(Object),
        expect.any(Object),
        false,
        ['encrypt', 'decrypt']
      )
    })
  })

  describe('encryptContent', () => {
    it('should encrypt content with AES-GCM', async () => {
      const content = 'test content'
      const mockKey = {}

      const result = await encryptContent(content, mockKey)

      expect(crypto.subtle.encrypt).toHaveBeenCalledWith(
        {
          name: 'AES-GCM',
          iv: expect.any(Uint8Array)
        },
        mockKey,
        expect.any(Uint8Array)
      )

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      expect(result).toContain(':') // Should have iv:encrypted format
    })

    it('should return iv:encrypted format', async () => {
      const content = 'test content'
      const mockKey = {}

      const result = await encryptContent(content, mockKey)
      const parts = result.split(':')

      expect(parts).toHaveLength(2)
      expect(parts[0]).toMatch(/^[0-9a-f]+$/) // IV as hex
      expect(parts[1]).toMatch(/^[0-9a-f]+$/) // Encrypted as hex
    })
  })

  describe('decryptContent', () => {
    it('should decrypt content with AES-GCM', async () => {
      const encryptedContent = 'abcd1234567890ab:fedcba0987654321'
      const mockKey = {}

      const result = await decryptContent(encryptedContent, mockKey)

      expect(crypto.subtle.decrypt).toHaveBeenCalledWith(
        {
          name: 'AES-GCM',
          iv: expect.any(Uint8Array)
        },
        mockKey,
        expect.any(Uint8Array)
      )

      expect(result).toBe('decrypted content')
    })

    it('should parse iv and encrypted data correctly', async () => {
      const encryptedContent = 'abcd1234:fedcba09'
      const mockKey = {}

      await decryptContent(encryptedContent, mockKey)

      const expectedIv = new Uint8Array([0xab, 0xcd, 0x12, 0x34])
      const expectedEncrypted = new Uint8Array([0xfe, 0xdc, 0xba, 0x09])

      expect(crypto.subtle.decrypt).toHaveBeenCalledWith(
        expect.objectContaining({
          iv: expectedIv
        }),
        mockKey,
        expectedEncrypted
      )
    })
  })

  describe('End-to-End Basic Encryption with Mocks', () => {
    it('should encrypt and decrypt content successfully with mocked crypto', async () => {
      const password = 'test-password-123'
      const originalContent = 'This is secret content that should be encrypted!'

      // Generate salt and derive key
      const salt = await generateSalt()
      const key = await deriveKey(password, salt)

      // Encrypt content
      const encrypted = await encryptContent(originalContent, key)
      expect(encrypted).toBeDefined()
      expect(encrypted).toContain(':')
      expect(encrypted).not.toBe(originalContent)

      // Derive key again with same password and salt
      const key2 = await deriveKey(password, salt)

      // Decrypt content - with mocked crypto, this returns "decrypted content"
      const decrypted = await decryptContent(encrypted, key2)
      expect(decrypted).toBe('decrypted content') // This is what our mock returns
    })

    it('should handle decryption workflow with mocked crypto', async () => {
      const password = 'test-password'
      const content = 'Secret content'

      // Test the workflow with mocked implementations
      const salt = await generateSalt()
      const key = await deriveKey(password, salt)
      const encrypted = await encryptContent(content, key)
      const decrypted = await decryptContent(encrypted, key)

      // Verify the functions were called and completed
      expect(salt).toBeDefined()
      expect(key).toBeDefined()
      expect(encrypted).toBeDefined()
      expect(decrypted).toBe('decrypted content')
      expect(global.crypto.subtle.importKey).toHaveBeenCalled()
      expect(global.crypto.subtle.deriveKey).toHaveBeenCalled()
      expect(global.crypto.subtle.encrypt).toHaveBeenCalled()
      expect(global.crypto.subtle.decrypt).toHaveBeenCalled()
    })
  })
})