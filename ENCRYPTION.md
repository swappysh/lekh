# Lekh Encryption System

## Overview

Lekh uses a hybrid public key encryption (PKE) system to provide secure, client-side encryption while maintaining the core principle of uninterrupted writing. The system ensures that content is always encrypted before being stored in the database, but only the owner's password can decrypt it for reading.

## Design Principles

1. **Uninterrupted Writing**: Anyone can write to a URL without password prompts
2. **Always Encrypted**: All content is encrypted before database storage
3. **Owner-Only Reading**: Only the owner with the correct password can decrypt content
4. **Client-Side Security**: All cryptographic operations happen in the browser
5. **Standard Cryptography**: Uses well-established RSA-OAEP + AES-GCM encryption

## Architecture

### Hybrid Encryption Pattern

The system uses hybrid encryption, combining the benefits of both symmetric and asymmetric cryptography:

```
Content → AES-GCM → Encrypted Content
Random AES Key → RSA-OAEP → Encrypted Data Key
```

**Why Hybrid?**
- **Performance**: AES is fast for encrypting large content
- **Security**: RSA provides secure key exchange
- **Scalability**: Works efficiently regardless of content size

### Key Components

#### 1. PublicKeyEncryption Class
- `generateAuthorKeys(password, salt)` - Creates RSA keypair with encrypted private key
- `encrypt(content, publicKey)` - Encrypts content using hybrid encryption
- `decrypt(encryptedContent, encryptedDataKey, password, encryptedPrivateKey, salt)` - Decrypts content

#### 2. Database Schema
```sql
-- Users table stores encryption keys
CREATE TABLE users (
  username TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,           -- RSA public key (base64)
  encrypted_private_key TEXT NOT NULL, -- AES-encrypted RSA private key
  salt TEXT NOT NULL                  -- PBKDF2 salt
);

-- Documents table stores encrypted content
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  username TEXT,
  encrypted_content TEXT NOT NULL,    -- AES-GCM encrypted content
  encrypted_data_key TEXT NOT NULL,   -- RSA-encrypted AES key
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

## Cryptographic Details

### Key Generation (User Creation)

1. **Generate RSA Keypair**
   ```javascript
   const keypair = await crypto.subtle.generateKey({
     name: 'RSA-OAEP',
     modulusLength: 2048,
     publicExponent: new Uint8Array([1, 0, 1]),
     hash: 'SHA-256',
   }, true, ['encrypt', 'decrypt'])
   ```

2. **Derive Password Key**
   ```javascript
   const passwordKey = await crypto.subtle.deriveKey({
     name: 'PBKDF2',
     salt: saltBytes,
     iterations: 100000,
     hash: 'SHA-256',
   }, passwordMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
   ```

3. **Encrypt Private Key**
   ```javascript
   const encryptedPrivateKey = await crypto.subtle.encrypt({
     name: 'AES-GCM',
     iv: randomIV
   }, passwordKey, privateKeyBytes)
   ```

### Content Encryption (Writing)

1. **Generate Random AES Key**
   ```javascript
   const dataKey = await crypto.subtle.generateKey({
     name: 'AES-GCM',
     length: 256
   }, true, ['encrypt'])
   ```

2. **Encrypt Content with AES**
   ```javascript
   const encryptedContent = await crypto.subtle.encrypt({
     name: 'AES-GCM',
     iv: randomIV
   }, dataKey, contentBytes)
   ```

3. **Encrypt Data Key with RSA**
   ```javascript
   const encryptedDataKey = await crypto.subtle.encrypt({
     name: 'RSA-OAEP'
   }, publicKey, dataKeyBytes)
   ```

### Content Decryption (Reading)

1. **Derive Password Key** (same as generation)
2. **Decrypt Private Key**
   ```javascript
   const privateKey = await crypto.subtle.decrypt({
     name: 'AES-GCM',
     iv: extractedIV
   }, passwordKey, encryptedPrivateKeyBytes)
   ```

3. **Decrypt Data Key with RSA**
   ```javascript
   const dataKey = await crypto.subtle.decrypt({
     name: 'RSA-OAEP'
   }, privateKey, encryptedDataKeyBytes)
   ```

4. **Decrypt Content with AES**
   ```javascript
   const content = await crypto.subtle.decrypt({
     name: 'AES-GCM',
     iv: extractedIV
   }, dataKey, encryptedContentBytes)
   ```

## Security Properties

### Encryption Strength
- **RSA-OAEP 2048-bit**: Industry standard for asymmetric encryption
- **AES-GCM 256-bit**: Military-grade symmetric encryption with authentication
- **PBKDF2 100,000 iterations**: Resistant to brute force attacks
- **Random IVs**: Each encryption operation uses unique initialization vectors

### Threat Model Protection
- **Server Breach**: All data encrypted; server cannot decrypt without user passwords
- **Database Compromise**: Content remains secure; requires both encrypted keys and passwords
- **Network Interception**: All sensitive data encrypted before transmission
- **Password Attacks**: PBKDF2 with high iteration count slows brute force attempts

### Client-Side Security
- **No Server-Side Keys**: Server never sees unencrypted content or private keys
- **Web Crypto API**: Uses browser's native cryptographic implementations
- **Memory Safety**: Keys exist only during active sessions

## User Experience Flow

### 1. Account Creation (`/`)
```
User enters username + password
↓
Generate RSA keypair (2048-bit)
↓
Encrypt private key with password-derived AES key
↓
Store: public_key, encrypted_private_key, salt
```

### 2. Writing Content (`/username`)
```
Load public key from database
↓
User types content (no password needed)
↓
Generate random AES key
↓
Encrypt content with AES key
↓
Encrypt AES key with RSA public key
↓
Store: encrypted_content, encrypted_data_key
```

### 3. Reading Content (`/username/all`)
```
Load encrypted entries + encrypted private key
↓
Prompt for password
↓
Derive AES key from password + salt
↓
Decrypt RSA private key
↓
For each entry:
  ├─ Decrypt AES key with RSA private key
  └─ Decrypt content with AES key
```

## Implementation Benefits

### Security
- **Zero-Trust Server**: Server cannot decrypt any user content
- **Forward Secrecy**: Each document encrypted with unique AES key
- **Password Protection**: Content inaccessible without user password
- **Standard Algorithms**: Uses well-vetted cryptographic primitives

### Performance
- **Hybrid Approach**: Fast AES for content, RSA only for small keys
- **Client-Side**: No server crypto overhead
- **Streaming Capable**: Can handle large documents efficiently

### User Experience
- **No Writing Friction**: Content auto-encrypts without user interaction
- **Selective Access**: Password only required for reading
- **Cross-Device**: Works on any device with Web Crypto API support

## Error Handling

### Graceful Degradation
- Invalid passwords show user-friendly error messages
- Corrupted data marked as "[Decryption failed]" rather than crashing
- Missing keys handled with appropriate fallbacks

### Security Considerations
- Failed decryption doesn't leak information about content
- Password attempts are not rate-limited (client-side only)
- No sensitive data logged in error messages

## Testing Strategy

### Unit Tests
- Individual cryptographic operations (encrypt, decrypt, key generation)
- Mock Web Crypto API for deterministic testing
- Edge cases and error conditions

### Integration Tests  
- End-to-end encryption/decryption workflows
- Database schema compatibility
- User interface interactions with encryption

### Security Tests
- Key isolation between users
- Content isolation between documents
- Password requirements and validation

## Future Considerations

### Potential Enhancements
- **Key Rotation**: Support for updating encryption keys
- **Backup Recovery**: Secure key backup/recovery mechanisms
- **Multi-Device**: Key synchronization across devices
- **Shared Writing**: Multi-user access with different key levels

### Performance Optimizations
- **Key Caching**: Temporary password-derived key caching
- **Batch Operations**: Bulk encryption/decryption for multiple documents
- **Progressive Loading**: Decrypt content as needed rather than all at once

## Compliance Notes

This implementation provides:
- **GDPR Compliance**: User data encrypted with user-controlled keys
- **Data Sovereignty**: Users retain cryptographic control of their data  
- **Privacy by Design**: Server cannot access plaintext content
- **Right to be Forgotten**: User data cryptographically inaccessible after key deletion

---

*This encryption system balances security, performance, and user experience to provide a writing platform where privacy is built-in, not bolted-on.*