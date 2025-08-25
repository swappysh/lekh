/**
 * Clean Public Key Encryption Implementation
 * 
 * Design:
 * - Writer key (server holds): Author's public key - used to encrypt
 * - Author key (password-protected): Author's private key - used to decrypt
 * - Hybrid encryption: random data key + public key encryption of data key
 */

export class PublicKeyEncryption {
  /**
   * Generate author keypair and encrypt private key with password
   * @param {string} password - Author's password
   * @param {Uint8Array} salt - Random salt for password derivation
   * @returns {Object} { publicKey, encryptedPrivateKey, salt }
   */
  static async generateAuthorKeys(password, salt) {
    // Generate RSA-OAEP keypair for encryption
    const keypair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true, // extractable
      ['encrypt', 'decrypt']
    )

    // Export public key (for server storage - "writer key")
    const publicKey = await crypto.subtle.exportKey('spki', keypair.publicKey)
    const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(publicKey)))

    // Export private key
    const privateKey = await crypto.subtle.exportKey('pkcs8', keypair.privateKey)
    
    // Derive password key using PBKDF2
    const passwordKey = await this.derivePasswordKey(password, salt)
    
    // Encrypt private key with password-derived key
    const encryptedPrivateKey = await this.encryptWithPasswordKey(
      new Uint8Array(privateKey), 
      passwordKey
    )

    return {
      publicKey: publicKeyBase64,
      encryptedPrivateKey: encryptedPrivateKey,
      salt: btoa(String.fromCharCode(...salt))
    }
  }

  /**
   * Derive key from password using PBKDF2
   */
  static async derivePasswordKey(password, salt) {
    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    )

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
  }

  /**
   * Encrypt data with password-derived key
   */
  static async encryptWithPasswordKey(data, passwordKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      passwordKey,
      data
    )

    // Return iv:encrypted as base64
    const ivB64 = btoa(String.fromCharCode(...iv))
    const encryptedB64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)))
    return ivB64 + ':' + encryptedB64
  }

  /**
   * Decrypt data with password-derived key
   */
  static async decryptWithPasswordKey(encryptedData, passwordKey) {
    const [ivB64, encryptedB64] = encryptedData.split(':')
    const iv = new Uint8Array(atob(ivB64).split('').map(c => c.charCodeAt(0)))
    const encrypted = new Uint8Array(atob(encryptedB64).split('').map(c => c.charCodeAt(0)))

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      passwordKey,
      encrypted
    )

    return new Uint8Array(decrypted)
  }

  /**
   * Encrypt content using hybrid encryption (server-side encryption)
   * @param {string} plaintext - Content to encrypt
   * @param {string} publicKeyBase64 - Author's public key (base64)
   * @returns {Object} { encryptedContent, encryptedDataKey }
   */
  static async encrypt(plaintext, publicKeyBase64) {
    try {
      // 1. Generate random data key (32 bytes)
      const dataKey = crypto.getRandomValues(new Uint8Array(32))
      
      // 2. Import data key for AES-GCM
      const aesKey = await crypto.subtle.importKey(
        'raw',
        dataKey,
        'AES-GCM',
        false,
        ['encrypt']
      )
      
      // 3. Encrypt content with data key
      const encoder = new TextEncoder()
      const contentBytes = encoder.encode(plaintext)
      const iv = crypto.getRandomValues(new Uint8Array(12))
      
      const encryptedContent = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        contentBytes
      )
      
      // 4. Import author's public key
      const publicKeyBytes = new Uint8Array(atob(publicKeyBase64).split('').map(c => c.charCodeAt(0)))
      const publicKey = await crypto.subtle.importKey(
        'spki',
        publicKeyBytes,
        {
          name: 'RSA-OAEP',
          hash: 'SHA-256',
        },
        false,
        ['encrypt']
      )
      
      // 5. Encrypt data key with public key
      const encryptedDataKey = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        publicKey,
        dataKey
      )
      
      // 6. Return both encrypted content and encrypted data key
      const ivB64 = btoa(String.fromCharCode(...iv))
      const contentB64 = btoa(String.fromCharCode(...new Uint8Array(encryptedContent)))
      const dataKeyB64 = btoa(String.fromCharCode(...new Uint8Array(encryptedDataKey)))
      
      return {
        encryptedContent: ivB64 + ':' + contentB64,
        encryptedDataKey: dataKeyB64
      }
    } catch (error) {
      console.error('Encryption failed:', error)
      throw new Error('Encryption failed')
    }
  }

  /**
   * Decrypt content using author's private key (author-side decryption)
   * @param {string} encryptedContent - Encrypted content (iv:content base64)
   * @param {string} encryptedDataKey - Encrypted data key (base64)
   * @param {string} password - Author's password
   * @param {string} encryptedPrivateKey - Author's encrypted private key
   * @param {string} saltBase64 - Salt for password derivation
   * @returns {string} Decrypted plaintext
   */
  static async decrypt(encryptedContent, encryptedDataKey, password, encryptedPrivateKey, saltBase64) {
    try {
      // 1. Derive password key
      const salt = new Uint8Array(atob(saltBase64).split('').map(c => c.charCodeAt(0)))
      const passwordKey = await this.derivePasswordKey(password, salt)
      
      // 2. Decrypt private key with password
      const privateKeyBytes = await this.decryptWithPasswordKey(encryptedPrivateKey, passwordKey)
      
      // 3. Import private key
      const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        privateKeyBytes,
        {
          name: 'RSA-OAEP',
          hash: 'SHA-256',
        },
        false,
        ['decrypt']
      )
      
      // 4. Decrypt data key with private key
      const encryptedDataKeyBytes = new Uint8Array(atob(encryptedDataKey).split('').map(c => c.charCodeAt(0)))
      const dataKey = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        encryptedDataKeyBytes
      )
      
      // 5. Import data key for AES-GCM
      const aesKey = await crypto.subtle.importKey(
        'raw',
        dataKey,
        'AES-GCM',
        false,
        ['decrypt']
      )
      
      // 6. Decrypt content with data key
      const [ivB64, contentB64] = encryptedContent.split(':')
      const iv = new Uint8Array(atob(ivB64).split('').map(c => c.charCodeAt(0)))
      const encrypted = new Uint8Array(atob(contentB64).split('').map(c => c.charCodeAt(0)))
      
      const decryptedContent = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        encrypted
      )
      
      return new TextDecoder().decode(decryptedContent)
    } catch (error) {
      console.error('Decryption failed:', error)
      throw new Error('Decryption failed - invalid password or corrupted data')
    }
  }
}