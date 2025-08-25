export async function generateSalt() {
  const saltBuffer = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(saltBuffer, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function deriveKey(password, salt) {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )
  
  const saltBuffer = new Uint8Array(salt.match(/.{2}/g).map(byte => parseInt(byte, 16)))
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptContent(content, key) {
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(content)
  )
  
  const ivHex = Array.from(iv, byte => byte.toString(16).padStart(2, '0')).join('')
  const encryptedHex = Array.from(new Uint8Array(encrypted), byte => byte.toString(16).padStart(2, '0')).join('')
  
  return ivHex + ':' + encryptedHex
}

export async function decryptContent(encryptedContent, key) {
  const [ivHex, encryptedHex] = encryptedContent.split(':')
  
  const iv = new Uint8Array(ivHex.match(/.{2}/g).map(byte => parseInt(byte, 16)))
  const encrypted = new Uint8Array(encryptedHex.match(/.{2}/g).map(byte => parseInt(byte, 16)))
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  )
  
  return new TextDecoder().decode(decrypted)
}

export async function generateDocumentKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

export async function encryptDocumentKey(documentKey, userKey) {
  const keyData = await crypto.subtle.exportKey('raw', documentKey)
  const keyHex = Array.from(new Uint8Array(keyData), byte => byte.toString(16).padStart(2, '0')).join('')
  return encryptContent(keyHex, userKey)
}

export async function decryptDocumentKey(encryptedDocumentKey, userKey) {
  const keyHex = await decryptContent(encryptedDocumentKey, userKey)
  const keyData = new Uint8Array(keyHex.match(/.{2}/g).map(byte => parseInt(byte, 16)))
  
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  )
}