export const DEBOUNCE_DELAY = 300

export const HEALTH_CHECK_INTERVAL = 30000

export const PRIVATE_APPEND_ROUTE = '/api/private-append'

export const JSON_CONTENT_TYPE_HEADER = { 'Content-Type': 'application/json' }

// Validation limits for the public-write endpoints.
//
// Lekh is public-write / private-read: anyone may POST to a private username
// using only the public anon key, so these endpoints are the only thing
// standing between the database and an anonymous flood. Caps keep a hostile
// client from storing unbounded rows or oversized payloads.
//
// Note: a snapshot id is public (it lives in the world-readable documents
// table), so it is not a credential. The same client reuses its id for autosave;
// to stop anyone else replacing that row it also sends a random writer token, and
// the database keeps only its hash. A fresh random id appends.
export const USERNAME_REGEX = /^[A-Za-z0-9_-]+$/
export const USERNAME_MAX_LENGTH = 64

export const SNAPSHOT_ID_REGEX = /^[A-Za-z0-9_-]+$/
export const SNAPSHOT_ID_MAX_LENGTH = 64

// Random per-session secret (base64url of 32 bytes is 43 chars) that proves a
// writer owns the snapshot id it is updating. Optional while old tabs drain.
export const WRITER_TOKEN_REGEX = /^[A-Za-z0-9_-]{22,128}$/

// Base64 AES-GCM ciphertext. Vercel caps the request body near 4.5MB and the
// API route parses up to 4mb, so keep the field itself under that.
export const MAX_ENCRYPTED_CONTENT_LENGTH = 3800000
// Base64 RSA-OAEP blob of a 256-bit key is ~344 chars; allow generous margin.
export const MAX_ENCRYPTED_DATA_KEY_LENGTH = 2000

// User creation payload caps. Values come from WebCrypto (SPKI / PKCS8 base64).
export const MAX_PUBLIC_KEY_LENGTH = 2000
export const MAX_ENCRYPTED_PRIVATE_KEY_LENGTH = 4000
export const MAX_SALT_LENGTH = 128

// Password change (key rotation). The route only accepts a commit from a client
// that decrypted a fresh server challenge with the current private key.
export const ROTATE_KEY_ROUTE = '/api/rotate-key'
export const MIN_PASSWORD_LENGTH = 12
export const CHALLENGE_TTL_MS = 2 * 60 * 1000
export const MAX_ROTATE_DOCUMENTS = 7000
export const MAX_CHALLENGE_LENGTH = 2000
// A password change is one challenge plus one commit, with a few retries on 409.
// Counted per client IP, not per username, so a stranger on another network cannot lock the owner out.
export const ROTATE_RATE_LIMIT = 12
export const ROTATE_RATE_WINDOW_SECONDS = 10 * 60
