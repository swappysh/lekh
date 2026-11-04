import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import { createChallenge, verifyChallenge } from '../../lib/rotateChallenge'
import {
  USERNAME_REGEX,
  USERNAME_MAX_LENGTH,
  MAX_PUBLIC_KEY_LENGTH,
  MAX_ENCRYPTED_PRIVATE_KEY_LENGTH,
  MAX_SALT_LENGTH,
  MAX_ENCRYPTED_DATA_KEY_LENGTH,
  MAX_ROTATE_DOCUMENTS,
  MAX_CHALLENGE_LENGTH,
} from '../../lib/constants'

// Password change: rotates the author's RSA keypair and re-wraps each entry's
// data key. Unlike private-append this is NOT public-write. A commit needs proof
// that the caller can decrypt with the current private key:
//   step "challenge": server returns a nonce encrypted to the current public key
//   step "commit":    client returns the decrypted nonce plus the new key material
// The swap itself runs in the rotate_user_key SQL function (one transaction).
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
}

function parseBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return null
    }
  }
  return req.body
}

const tooLong = (value, max) => value.length > max

const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/

function isValidDataKeyEntry(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.old_hash === 'string' &&
    SHA256_HEX_REGEX.test(value.old_hash) &&
    typeof value.new === 'string' &&
    value.new.length > 0 &&
    !tooLong(value.new, MAX_ENCRYPTED_DATA_KEY_LENGTH)
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = parseBody(req)
  if (!body) {
    return res.status(400).json({ error: 'Invalid request body' })
  }

  const step = String(body.step || '')
  const username = String(body.username || '').trim()

  if (!username || username.length > USERNAME_MAX_LENGTH || !USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: 'Invalid username' })
  }

  if (step !== 'challenge' && step !== 'commit') {
    return res.status(400).json({ error: 'Invalid step' })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('username, public_key, is_public')
      .eq('username', username)
      .maybeSingle()

    if (userError) {
      return res.status(500).json({ error: 'Failed to validate user' })
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    if (user.is_public) {
      return res.status(403).json({ error: 'Public users have no password to change' })
    }

    if (step === 'challenge') {
      return res.status(200).json(createChallenge(username, user.public_key))
    }

    const token = String(body.token || '')
    const challengeResponse = String(body.challengeResponse || '')
    const publicKey = String(body.publicKey || '')
    const encryptedPrivateKey = String(body.encryptedPrivateKey || '')
    const salt = String(body.salt || '')
    const dataKeys = body.dataKeys

    if (!token || !challengeResponse || !publicKey || !encryptedPrivateKey || !salt || !dataKeys) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    if (
      tooLong(token, MAX_CHALLENGE_LENGTH) ||
      tooLong(challengeResponse, MAX_CHALLENGE_LENGTH) ||
      tooLong(publicKey, MAX_PUBLIC_KEY_LENGTH) ||
      tooLong(encryptedPrivateKey, MAX_ENCRYPTED_PRIVATE_KEY_LENGTH) ||
      tooLong(salt, MAX_SALT_LENGTH)
    ) {
      return res.status(413).json({ error: 'Field too large' })
    }

    if (typeof dataKeys !== 'object' || Array.isArray(dataKeys)) {
      return res.status(400).json({ error: 'Invalid dataKeys' })
    }
    const entries = Object.entries(dataKeys)
    if (entries.length > MAX_ROTATE_DOCUMENTS) {
      return res.status(413).json({ error: 'Too many entries' })
    }
    if (entries.some(([, value]) => !isValidDataKeyEntry(value))) {
      return res.status(400).json({ error: 'Invalid dataKeys' })
    }

    const proven = verifyChallenge({
      token,
      nonceBase64: challengeResponse,
      username,
      publicKeyBase64: user.public_key,
    })
    if (!proven) {
      return res.status(403).json({ error: 'Challenge failed or expired' })
    }

    const { error: rpcError } = await supabaseAdmin.rpc('rotate_user_key', {
      p_username: username,
      p_old_public_key: user.public_key,
      p_new_public_key: publicKey,
      p_encrypted_private_key: encryptedPrivateKey,
      p_salt: salt,
      p_doc_keys: dataKeys,
    })

    if (rpcError) {
      if (/entries changed|key changed/.test(rpcError.message || '')) {
        return res.status(409).json({ error: 'Entries changed during update, try again' })
      }
      return res.status(500).json({ error: 'Failed to update password' })
    }

    return res.status(200).json({ ok: true })
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}
