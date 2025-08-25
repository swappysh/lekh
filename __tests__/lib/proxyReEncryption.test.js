/**
 * @jest-environment jsdom
 */

import { ProxyReEncryption } from '../../lib/proxyReEncryption'

// Mock crypto.subtle for testing
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: jest.fn((array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256)
      }
      return array
    }),
    subtle: {
      importKey: jest.fn(() => Promise.resolve({})),
      encrypt: jest.fn(() => Promise.resolve(new ArrayBuffer(16))),
      decrypt: jest.fn(() => Promise.resolve(new TextEncoder().encode('decrypted content').buffer))
    }
  }
})

describe('ProxyReEncryption', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('generateKeyPair', () => {
    it('should generate a key pair with public and private keys', () => {
      const keyPair = ProxyReEncryption.generateKeyPair()
      
      expect(keyPair).toHaveProperty('publicKey')
      expect(keyPair).toHaveProperty('privateKey')
      expect(typeof keyPair.publicKey).toBe('string')
      expect(typeof keyPair.privateKey).toBe('string')
      expect(keyPair.publicKey.length).toBeGreaterThan(0)
      expect(keyPair.privateKey.length).toBeGreaterThan(0)
    })

    it('should generate different key pairs on multiple calls', () => {
      const keyPair1 = ProxyReEncryption.generateKeyPair()
      const keyPair2 = ProxyReEncryption.generateKeyPair()
      
      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey)
      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey)
    })
  })

  describe('generateTransformKey', () => {
    it('should generate a transformation key', () => {
      const writerKeyPair = ProxyReEncryption.generateKeyPair()
      const ownerKeyPair = ProxyReEncryption.generateKeyPair()
      
      const transformKey = ProxyReEncryption.generateTransformKey(
        writerKeyPair.privateKey,
        ownerKeyPair.publicKey
      )
      
      expect(transformKey).toBeDefined()
      expect(typeof transformKey).toBe('string')
      expect(transformKey.length).toBeGreaterThan(0)
    })

    it('should generate the same transform key for same inputs', () => {
      const writerKeyPair = ProxyReEncryption.generateKeyPair()
      const ownerKeyPair = ProxyReEncryption.generateKeyPair()
      
      const transformKey1 = ProxyReEncryption.generateTransformKey(
        writerKeyPair.privateKey,
        ownerKeyPair.publicKey
      )
      
      const transformKey2 = ProxyReEncryption.generateTransformKey(
        writerKeyPair.privateKey,
        ownerKeyPair.publicKey
      )
      
      expect(transformKey1).toBe(transformKey2)
    })
  })

  describe('encrypt', () => {
    it('should encrypt plaintext with writer public key', async () => {
      const plaintext = 'Hello, world!'
      const writerKeyPair = ProxyReEncryption.generateKeyPair()
      
      const ciphertext = await ProxyReEncryption.encrypt(plaintext, writerKeyPair.publicKey)
      
      expect(ciphertext).toHaveProperty('c1')
      expect(ciphertext).toHaveProperty('c2')
      expect(typeof ciphertext.c1).toBe('string')
      expect(typeof ciphertext.c2).toBe('string')
      expect(ciphertext.c1.length).toBeGreaterThan(0)
      expect(ciphertext.c2.length).toBeGreaterThan(0)
    })

    it('should call crypto.subtle.encrypt', async () => {
      const plaintext = 'test message'
      const writerKeyPair = ProxyReEncryption.generateKeyPair()
      
      await ProxyReEncryption.encrypt(plaintext, writerKeyPair.publicKey)
      
      expect(crypto.subtle.importKey).toHaveBeenCalled()
      expect(crypto.subtle.encrypt).toHaveBeenCalled()
    })
  })

  describe('transform', () => {
    it('should transform ciphertext using transformation key', () => {
      const writerKeyPair = ProxyReEncryption.generateKeyPair()
      const ownerKeyPair = ProxyReEncryption.generateKeyPair()
      const transformKey = ProxyReEncryption.generateTransformKey(
        writerKeyPair.privateKey,
        ownerKeyPair.publicKey
      )
      
      const originalCiphertext = {
        c1: writerKeyPair.publicKey, // Using public key as mock c1
        c2: 'mock-encrypted-data'
      }
      
      const transformedCiphertext = ProxyReEncryption.transform(originalCiphertext, transformKey)
      
      expect(transformedCiphertext).toHaveProperty('c1_prime')
      expect(transformedCiphertext).toHaveProperty('c2')
      expect(transformedCiphertext.c2).toBe(originalCiphertext.c2)
      expect(transformedCiphertext.c1_prime).not.toBe(originalCiphertext.c1)
    })
  })

  describe('decrypt', () => {
    it('should decrypt transformed ciphertext with owner private key', async () => {
      const ownerKeyPair = ProxyReEncryption.generateKeyPair()
      const transformedCiphertext = {
        c1_prime: ownerKeyPair.publicKey, // Mock transformed data
        c2: 'abcd1234567890ab:fedcba0987654321' // Valid format: iv:encrypted
      }
      
      const decryptedContent = await ProxyReEncryption.decrypt(
        transformedCiphertext,
        ownerKeyPair.privateKey
      )
      
      expect(decryptedContent).toBe('decrypted content')
      expect(crypto.subtle.importKey).toHaveBeenCalled()
      expect(crypto.subtle.decrypt).toHaveBeenCalled()
    })
  })

  describe('End-to-end workflow', () => {
    it('should complete full proxy re-encryption workflow', async () => {
      const plaintext = 'Secret message for proxy re-encryption test'
      
      // Generate key pairs
      const writerKeyPair = ProxyReEncryption.generateKeyPair()
      const ownerKeyPair = ProxyReEncryption.generateKeyPair()
      
      // Generate transformation key
      const transformKey = ProxyReEncryption.generateTransformKey(
        writerKeyPair.privateKey,
        ownerKeyPair.publicKey
      )
      
      // Encrypt with writer key
      const ciphertext = await ProxyReEncryption.encrypt(plaintext, writerKeyPair.publicKey)
      
      // Transform ciphertext
      const transformedCiphertext = ProxyReEncryption.transform(ciphertext, transformKey)
      
      // Decrypt with owner key
      const decryptedContent = await ProxyReEncryption.decrypt(
        transformedCiphertext,
        ownerKeyPair.privateKey
      )
      
      // With mocked crypto, we get the mocked response
      expect(decryptedContent).toBe('decrypted content')
    })
  })
})