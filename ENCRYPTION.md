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

## Public Write Model (intended)

Lekh is deliberately **public write, private read**:

- **Anyone can write** to any private username using only the public anon key and
  the owner's public RSA key. No account, session, or password is required for a
  write (`POST /api/private-append`).
- **Only the owner can read** plaintext, with the password that unlocks the
  encrypted private key. The database stores ciphertext only.

Accepted consequences:

- The `users` and `documents` tables are readable through the anon key so any
  browser can encrypt to a public key and the owner's browser can fetch its own
  ciphertext. Usernames, snapshot ids, timestamps, `public_key`,
  `encrypted_private_key`, and `salt` are therefore public. Public ciphertext plus
  salt allows offline password guessing; PBKDF2 slows it down.
- A snapshot id is public. The same client reuses its own id while autosaving, so
  a row is updated in place; a fresh random id appends. An outside writer who
  deliberately reuses an existing id replaces that row's content.
- Junk or forged snapshots cannot be removed with the anon key (`documents` has a
  SELECT-only policy). Use `POST /api/private-delete` with
  `{ username, clientSnapshotId }`, which goes through the service role.
  Databases provisioned before the delete route carry a
  `documents_prevent_delete` `BEFORE DELETE` trigger that raises; `database.sql`
  drops it, so run the current `database.sql` (or its two `DROP` statements)
  once on any older database.

Both routes validate the username and snapshot id shape and bound payload sizes
(see `lib/constants.js`) so an anonymous client cannot store unbounded rows.

## Changing the Password (key rotation)

A password only wraps the RSA private key, and that same key decrypts every entry.
So re-wrapping the key with a new password would not lock out anyone who already
extracted it. "Change password" on `/all` therefore **rotates the keypair**:

1. Unlock the current private key with the current password (wrong password fails here).
2. Generate a new RSA keypair and wrap its private key with the new password and a new salt.
3. Re-wrap only each entry's `encrypted_data_key` to the new public key. Content
   ciphertext is untouched, so old entries stay readable. Every re-wrapped key is
   verified against the new private key before anything is sent. Entries whose data
   key cannot be decrypted (junk written by outsiders) are left as they are.
4. `POST /api/rotate-key` is not public-write. Step `challenge` returns a random
   nonce encrypted to the current public key plus a signed, 2 minute token. Step
   `commit` must return the decrypted nonce, which proves the caller holds the
   current private key without sending the password. Rotating the key invalidates
   outstanding tokens.
5. The `rotate_user_key` SQL function swaps `users` and every `documents` row in one
   transaction. For each entry the client sends the SHA-256 of the data key it read
   plus the re-wrapped key. If an entry is new, or was rewritten since the client read
   it (every autosave makes a fresh data key), the function raises and nothing
   changes (HTTP 409, the client can retry). Appends go through the `private_append`
   function, which takes a share lock on the user row and rechecks the writer's
   public key in the same transaction; rotation takes an update lock on that row, so
   the two cannot interleave and no write can land encrypted to a rotated-out key.

`/api/rotate-key` is rate limited to 12 requests per 10 minutes per client IP. Over
the limit it answers HTTP 429 with `Retry-After` set to the seconds until the window
resets. The counter lives in the `rate_limits` table and is bumped by the
`rate_limit_hit` SQL function, so every serverless instance shares it. It is per IP,
not per username, so a stranger on another network cannot lock the owner out of
changing the password (someone behind the same NAT or carrier IP shares the quota).
IPv6 clients are bucketed by their /64 prefix. If the counter call itself fails the
request is allowed. This does not limit password guessing: unlocking happens in the
browser and the offline attack never touches the server, so only the work factor and
password strength slow it down.

Limits: entries and ciphertext the old key could read stay readable by whoever held
it, so rotation protects only what is written afterwards. `private-append` now
requires the writer's `publicKey` and answers 409 when it is stale, so a tab opened
before the change cannot keep encrypting to the old key. Anyone who already holds the
old private key can also pass the ownership check and rotate first, so rotate
promptly after a compromise. The new password must be at
least 12 characters. The PBKDF2 work factor is still 100k iterations.

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