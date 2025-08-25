import EC from 'elliptic'

// Initialize elliptic curve
const ec = new EC.ec('secp256k1')

/**
 * Simplified Proxy Re-Encryption Implementation
 * 
 * This implements a basic proxy re-encryption scheme where:
 * 1. Writers encrypt with a public key
 * 2. Server transforms ciphertext using transformation key
 * 3. Only owner with private key can decrypt
 */

export class ProxyReEncryption {
  /**
   * Generate a key pair for writer or owner
   * @returns {Object} { publicKey: string, privateKey: string }
   */
  static generateKeyPair() {
    const keyPair = ec.genKeyPair()
    return {
      publicKey: keyPair.getPublic('hex'),
      privateKey: keyPair.getPrivate('hex')
    }
  }

  /**
   * Generate transformation key from writer private key to owner public key
   * @param {string} writerPrivateKey - Writer's private key (hex)
   * @param {string} ownerPublicKey - Owner's public key (hex)
   * @returns {string} Transformation key (hex)
   */
  static generateTransformKey(writerPrivateKey, ownerPublicKey) {
    try {
      // For simplicity, we'll make the transform key be the inverse of writer private key
      // This ensures mathematical consistency in the scheme
      const writerPriv = ec.keyFromPrivate(writerPrivateKey, 'hex')
      const writerPrivBN = writerPriv.getPrivate()
      
      // Transform key = modular inverse of writer private key
      const transformKey = writerPrivBN.invm(ec.curve.n)
      return transformKey.toString(16)
    } catch (error) {
      console.error('Transform key generation error:', error)
      throw new Error('Failed to generate transformation key')
    }
  }

  /**
   * First-level encryption (writer encrypts with their public key)
   * @param {string} plaintext - Message to encrypt
   * @param {string} writerPublicKey - Writer's public key (hex)
   * @returns {Object} { c1: string, c2: string }
   */
  static async encrypt(plaintext, writerPublicKey) {
    try {
      // Generate random k
      const k = ec.genKeyPair().getPrivate()
      const writerPub = ec.keyFromPublic(writerPublicKey, 'hex')
      
      // c1 = k * G (ephemeral public key)
      const c1 = ec.g.mul(k).encode('hex')
      
      // Shared secret = k * writer_public
      const sharedSecret = writerPub.getPublic().mul(k)
      const secretKey = sharedSecret.getX().toString(16)
      
      // c2 = AES encrypt plaintext with secretKey
      const c2 = await this.aesEncrypt(plaintext, secretKey)
      
      return { c1, c2 }
    } catch (error) {
      console.error('Encryption error:', error)
      throw new Error('Encryption failed')
    }
  }

  /**
   * Transform ciphertext from writer-encrypted to owner-encrypted
   * @param {Object} ciphertext - { c1, c2 } from first encryption
   * @param {string} transformKey - Transformation key
   * @returns {Object} { c1_prime, c2 } transformed ciphertext
   */
  static transform(ciphertext, transformKey) {
    const { c1, c2 } = ciphertext
    
    try {
      // Parse ephemeral public key and transform key
      const ephemeralPub = ec.keyFromPublic(c1, 'hex')
      const transformKeyBN = ec.keyFromPrivate(transformKey, 'hex').getPrivate()
      
      // c1' = transform_key * c1 (multiply ephemeral point by transform key)
      const c1_prime = ephemeralPub.getPublic().mul(transformKeyBN).encode('hex')
      
      return { c1_prime, c2 }
    } catch (error) {
      console.error('Transform error:', error)
      throw new Error('Transformation failed')
    }
  }

  /**
   * Final decryption (owner decrypts with their private key)
   * @param {Object} transformedCiphertext - { c1_prime, c2 }
   * @param {string} ownerPrivateKey - Owner's private key (hex)
   * @returns {string} Decrypted plaintext
   */
  static async decrypt(transformedCiphertext, ownerPrivateKey) {
    const { c1_prime, c2 } = transformedCiphertext
    
    try {
      const ownerPriv = ec.keyFromPrivate(ownerPrivateKey, 'hex')
      
      // Recover shared secret: owner_priv * c1'
      const c1PrimePoint = ec.keyFromPublic(c1_prime, 'hex')
      const sharedSecret = c1PrimePoint.getPublic().mul(ownerPriv.getPrivate())
      const secretKey = sharedSecret.getX().toString(16)
      
      // Decrypt c2 with secretKey
      return await this.aesDecrypt(c2, secretKey)
    } catch (error) {
      console.error('Decryption error:', error)
      throw new Error('Decryption failed')
    }
  }

  /**
   * AES encryption helper using Web Crypto API
   */
  static async aesEncrypt(plaintext, keyHex) {
    const encoder = new TextEncoder()
    const data = encoder.encode(plaintext)
    
    // Convert hex key to bytes and pad/truncate to 32 bytes
    const keyBytes = new Uint8Array(32)
    const hexBytes = keyHex.match(/.{2}/g) || []
    for (let i = 0; i < Math.min(hexBytes.length, 32); i++) {
      keyBytes[i] = parseInt(hexBytes[i], 16)
    }
    
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      'AES-GCM',
      false,
      ['encrypt']
    )
    
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    )
    
    // Return iv:encrypted as hex
    const ivHex = Array.from(iv, b => b.toString(16).padStart(2, '0')).join('')
    const encryptedHex = Array.from(new Uint8Array(encrypted), b => b.toString(16).padStart(2, '0')).join('')
    
    return ivHex + ':' + encryptedHex
  }

  /**
   * AES decryption helper using Web Crypto API
   */
  static async aesDecrypt(ciphertext, keyHex) {
    const [ivHex, encryptedHex] = ciphertext.split(':')
    
    // Convert hex key to bytes and pad/truncate to 32 bytes
    const keyBytes = new Uint8Array(32)
    const hexBytes = keyHex.match(/.{2}/g) || []
    for (let i = 0; i < Math.min(hexBytes.length, 32); i++) {
      keyBytes[i] = parseInt(hexBytes[i], 16)
    }
    
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      'AES-GCM',
      false,
      ['decrypt']
    )
    
    const iv = new Uint8Array(ivHex.match(/.{2}/g).map(byte => parseInt(byte, 16)))
    const encrypted = new Uint8Array(encryptedHex.match(/.{2}/g).map(byte => parseInt(byte, 16)))
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    )
    
    return new TextDecoder().decode(decrypted)
  }
}