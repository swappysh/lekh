import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import {
  USERNAME_REGEX,
  USERNAME_MAX_LENGTH,
  SNAPSHOT_ID_REGEX,
  SNAPSHOT_ID_MAX_LENGTH,
  MAX_ENCRYPTED_CONTENT_LENGTH,
  MAX_ENCRYPTED_DATA_KEY_LENGTH,
} from '../../lib/constants'

// Public-write endpoint: no session, no password. The blast radius is capped by
// validating the caller-supplied id and by bounding payload sizes.
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

  if (!username || username.length > USERNAME_MAX_LENGTH || !USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: 'Invalid username' })
  }

  if (!clientSnapshotId || !encryptedContent || !encryptedDataKey) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  if (clientSnapshotId.length > SNAPSHOT_ID_MAX_LENGTH || !SNAPSHOT_ID_REGEX.test(clientSnapshotId)) {
    return res.status(400).json({ error: 'Invalid clientSnapshotId' })
  }

  if (encryptedContent.length > MAX_ENCRYPTED_CONTENT_LENGTH) {
    return res.status(413).json({ error: 'Encrypted content too large' })
  }

  if (encryptedDataKey.length > MAX_ENCRYPTED_DATA_KEY_LENGTH) {
    return res.status(413).json({ error: 'Encrypted data key too large' })
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

    const { error: upsertError } = await supabaseAdmin
      .from('documents')
      .upsert({
        id: `${username}:${clientSnapshotId}`,
        username,
        encrypted_content: encryptedContent,
        encrypted_data_key: encryptedDataKey,
        client_snapshot_id: clientSnapshotId,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'username,client_snapshot_id',
      })

    if (upsertError) {
      return res.status(500).json({ error: 'Failed to save private snapshot' })
    }

    return res.status(200).json({ ok: true })
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}
