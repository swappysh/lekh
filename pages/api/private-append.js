import { createHash } from 'crypto'
import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import {
  USERNAME_REGEX,
  USERNAME_MAX_LENGTH,
  SNAPSHOT_ID_REGEX,
  SNAPSHOT_ID_MAX_LENGTH,
  WRITER_TOKEN_REGEX,
  MAX_ENCRYPTED_CONTENT_LENGTH,
  MAX_ENCRYPTED_DATA_KEY_LENGTH,
} from '../../lib/constants'

// Public-write endpoint: no session, no password. The blast radius is capped by
// validating the caller-supplied id, bounding payload sizes, and binding each
// snapshot id to the writer token that created it (a 403 with code not_writer means
// the id belongs to another writer; other 403s are not about the id).
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
  const publicKey = String(body.publicKey || '')
  const writerToken = String(body.writerToken || '')

  if (!username || username.length > USERNAME_MAX_LENGTH || !USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: 'Invalid username' })
  }

  if (!clientSnapshotId || !encryptedContent || !encryptedDataKey || !publicKey) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  if (clientSnapshotId.length > SNAPSHOT_ID_MAX_LENGTH || !SNAPSHOT_ID_REGEX.test(clientSnapshotId)) {
    return res.status(400).json({ error: 'Invalid clientSnapshotId' })
  }

  if (writerToken && !WRITER_TOKEN_REGEX.test(writerToken)) {
    return res.status(400).json({ error: 'Invalid writerToken' })
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

    // Only the hash of the writer token is stored. The database refuses to update
    // an existing snapshot unless the hash matches the one that created it.
    const writerHash = writerToken ? createHash('sha256').update(writerToken).digest('hex') : null

    // The key comparison and the write happen in one transaction inside
    // private_append, so a write encrypted to a rotated-out key cannot land
    // between a check here and the upsert.
    const { error: appendError } = await supabaseAdmin.rpc('private_append', {
      p_username: username,
      p_public_key: publicKey,
      p_client_snapshot_id: clientSnapshotId,
      p_encrypted_content: encryptedContent,
      p_encrypted_data_key: encryptedDataKey,
      p_writer_hash: writerHash,
    })

    if (appendError) {
      if (/key changed/.test(appendError.message || '')) {
        return res.status(409).json({ error: 'Encryption key changed, reload the page' })
      }
      if (/not the writer/.test(appendError.message || '')) {
        return res.status(403).json({ error: 'Snapshot belongs to another writer', code: 'not_writer' })
      }
      return res.status(500).json({ error: 'Failed to save private snapshot' })
    }

    return res.status(200).json({ ok: true })
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}
