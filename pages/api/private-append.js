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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = parseBody(req)
  if (!body) {
    return res.status(400).json({ error: 'Invalid request body' })
  }

  const username = String(body.username || '').trim()
  const clientSnapshotId = String(body.clientSnapshotId || '').trim()
  const encryptedContent = String(body.encryptedContent || '')
  const encryptedDataKey = String(body.encryptedDataKey || '')

  if (!username || !USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: 'Invalid username' })
  }

  if (!clientSnapshotId || !encryptedContent || !encryptedDataKey) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('username, is_public')
      .eq('username', username)
      .maybeSingle()

    if (userError) {
      return res.status(500).json({ error: 'Failed to validate user' })
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (user.is_public) {
      return res.status(403).json({ error: 'Private append is not allowed for public users' })
    }

    const { error: insertError } = await supabaseAdmin
      .from('documents')
      .insert({
        id: crypto.randomUUID(),
        username,
        encrypted_content: encryptedContent,
        encrypted_data_key: encryptedDataKey,
        client_snapshot_id: clientSnapshotId,
      })

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(200).json({ ok: true, duplicate: true })
      }
      return res.status(500).json({ error: 'Failed to append private snapshot' })
    }

    return res.status(201).json({ ok: true })
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}
