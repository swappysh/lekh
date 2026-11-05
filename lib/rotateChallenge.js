import crypto from 'crypto'
import { CHALLENGE_TTL_MS } from './constants'

// Server-only. A stateless proof-of-key-ownership challenge: the server encrypts
// a random nonce to the user's current public key, and signs a token binding
// {username, public key, nonce hash, expiry}. Only someone who can decrypt with
// the matching private key can return the nonce. Rotating the key invalidates
// every outstanding token because the key hash no longer matches.

function secret() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!value) {
    throw new Error('Missing server secret for challenge signing')
  }
  return value
}

const sha256Hex = (input) => crypto.createHash('sha256').update(input).digest('hex')

const sign = (payload) =>
  crypto.createHmac('sha256', secret()).update(payload).digest('base64url')

const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)
}

// `action` binds a token to the route that issued it, so a token minted for one
// action (password change) cannot authorize another (deleting an entry). Tokens
// issued before this claim existed carry no `a` and count as 'rotate'.
export const ROTATE_ACTION = 'rotate'
export const DELETE_ACTION = 'delete'

// `action` is required: a caller that forgets it must fail, not silently mint a
// token for a different action.
export function createChallenge(username, publicKeyBase64, now = Date.now(), action) {
  if (action !== ROTATE_ACTION && action !== DELETE_ACTION) {
    throw new Error('Unknown challenge action')
  }
  const nonce = crypto.randomBytes(32)
  const publicKey = crypto.createPublicKey({
    key: Buffer.from(publicKeyBase64, 'base64'),
    format: 'der',
    type: 'spki',
  })

  const encryptedChallenge = crypto
    .publicEncrypt(
      { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      nonce
    )
    .toString('base64')

  const payload = Buffer.from(
    JSON.stringify({
      u: username,
      a: action,
      k: sha256Hex(publicKeyBase64),
      n: sha256Hex(nonce),
      exp: now + CHALLENGE_TTL_MS,
    })
  ).toString('base64url')

  return { encryptedChallenge, token: `${payload}.${sign(payload)}` }
}

export function verifyChallenge({
  token,
  nonceBase64,
  username,
  publicKeyBase64,
  now = Date.now(),
  action,
}) {
  if (action !== ROTATE_ACTION && action !== DELETE_ACTION) {
    return false
  }
  const [payload, signature] = String(token || '').split('.')
  if (!payload || !signature || !safeEqual(signature, sign(payload))) {
    return false
  }

  let claims
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return false
  }

  if (claims.u !== username || claims.exp < now) {
    return false
  }
  if ((claims.a ?? ROTATE_ACTION) !== action) {
    return false
  }
  if (!safeEqual(claims.k, sha256Hex(publicKeyBase64))) {
    return false
  }

  const nonce = Buffer.from(String(nonceBase64 || ''), 'base64')
  return safeEqual(claims.n, sha256Hex(nonce))
}
