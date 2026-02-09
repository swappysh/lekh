import { getSupabaseAdmin } from '../../lib/supabaseAdmin'

const USERNAME_REGEX = /^[A-Za-z0-9_-]+$/

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

function parseIsPublic(value) {
  if (value === true || value === false) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') {
      return true
    }
    if (normalized === 'false') {
      return false
    }
  }

  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = parseBody(req)
  if (!body) {
    return res.status(400).json({ error: 'Invalid request body' })
  }

  const username = String(body.username || '').trim()
  const publicKey = String(body.publicKey || '')
  const encryptedPrivateKey = String(body.encryptedPrivateKey || '')
  const salt = String(body.salt || '')
  const isPublic = parseIsPublic(body.isPublic)

  if (!username || !USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: 'Invalid username' })
  }

  if (!publicKey || !encryptedPrivateKey || !salt) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  if (isPublic === null) {
    return res.status(400).json({ error: 'Invalid isPublic value' })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()

    const { data: existingUser, error: existsError } = await supabaseAdmin
      .from('users')
      .select('username')
      .eq('username', username)
      .maybeSingle()

    if (existsError) {
      return res.status(500).json({ error: 'Failed to verify username availability' })
    }

    if (existingUser) {
      return res.status(409).json({ error: 'Username already taken' })
    }

    const { error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        username,
        public_key: publicKey,
        encrypted_private_key: encryptedPrivateKey,
        salt,
        is_public: isPublic,
      })

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(409).json({ error: 'Username already taken' })
      }
      return res.status(500).json({ error: 'Failed to create user' })
    }

    return res.status(201).json({ username })
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}
