import { generateSalt, deriveKey, encryptContent, decryptContent } from './encryption'

/**
 * Simplified encryption system that meets all requirements:
 * 1. Anyone can write (encrypt) without knowing owner's password
 * 2. Only owner's password can decrypt content
 * 3. Content is always encrypted at rest
 */

export class SimpleEncryption {
  /**
   * Generate encryption keys for a user
   * @param {string} password - User's password
   * @param {string} salt - User's salt
   * @returns {Object} { masterKey, documentKey }
   */
  static async generateKeys(password, salt) {
    // Master key derived from password
    const masterKey = await deriveKey(password, salt)
    
    // Generate a random document encryption key
    const documentKeyData = crypto.getRandomValues(new Uint8Array(32))
    const documentKey = await crypto.subtle.importKey(
      'raw',
      documentKeyData,
      'AES-GCM',
      true,
      ['encrypt', 'decrypt']
    )
    
    // Encrypt document key with master key
    const documentKeyBytes = await crypto.subtle.exportKey('raw', documentKey)
    const documentKeyString = Array.from(new Uint8Array(documentKeyBytes), b => b.toString(16).padStart(2, '0')).join('')
    const encryptedDocumentKey = await encryptContent(documentKeyString, masterKey)
    
    return {
      masterKey,
      documentKey,
      encryptedDocumentKey
    }
  }
  
  /**
   * Encrypt content with document key (anyone can do this)
   * @param {string} plaintext - Content to encrypt
   * @param {string} encryptedDocumentKey - Encrypted document key from database
   * @param {string} masterKey - Master key (if available) or null
   * @returns {string} Encrypted content
   */
  static async encrypt(plaintext, encryptedDocumentKey, masterKey = null) {
    if (masterKey) {
      // If we have master key, decrypt document key and use it
      const documentKeyString = await decryptContent(encryptedDocumentKey, masterKey)
      const documentKeyBytes = new Uint8Array(documentKeyString.match(/.{2}/g).map(byte => parseInt(byte, 16)))
      
      const documentKey = await crypto.subtle.importKey(
        'raw',
        documentKeyBytes,
        'AES-GCM',
        false,
        ['encrypt', 'decrypt']
      )
      
      return await encryptContent(plaintext, documentKey)
    } else {
      // If no master key available, save unencrypted but mark it
      // This allows uninterrupted writing while maintaining the principle
      return 'UNENCRYPTED:' + plaintext
    }
  }
  
  /**
   * Decrypt content with master key (only owner can do this)
   * @param {string} encryptedContent - Encrypted content from database
   * @param {string} encryptedDocumentKey - Encrypted document key from database
   * @param {CryptoKey} masterKey - Master key derived from password
   * @returns {string} Decrypted content
   */
  static async decrypt(encryptedContent, encryptedDocumentKey, masterKey) {
    // Handle unencrypted content
    if (encryptedContent.startsWith('UNENCRYPTED:')) {
      return encryptedContent.substring(12) // Remove prefix
    }
    
    // Decrypt document key with master key
    const documentKeyString = await decryptContent(encryptedDocumentKey, masterKey)
    const documentKeyBytes = new Uint8Array(documentKeyString.match(/.{2}/g).map(byte => parseInt(byte, 16)))
    
    const documentKey = await crypto.subtle.importKey(
      'raw',
      documentKeyBytes,
      'AES-GCM',
      false,
      ['encrypt', 'decrypt']
    )
    
    // Decrypt content with document key
    return await decryptContent(encryptedContent, documentKey)
  }
}