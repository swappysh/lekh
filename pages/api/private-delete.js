import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import {
  USERNAME_REGEX,
  USERNAME_MAX_LENGTH,
  SNAPSHOT_ID_REGEX,
  SNAPSHOT_ID_MAX_LENGTH,
} from '../../lib/constants'

// Companion to /api/private-append. Because anyone may append to a private
// username, there needs to be a way to remove a forged or empty snapshot;
// the anon key cannot delete from documents (SELECT-only RLS), so this route
// goes through the service role. Deletion is public like writing.
//
// Accepts POST with a JSON body or DELETE with query params:
//   { username, clientSnapshotId }

function parseBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return null
    }
  }
  return req.body || {}
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = parseBody(req)
  if (!body) {
    return res.status(400).json({ error: 'Invalid request body' })
  }

  const query = req.query || {}
  const username = String(body.username || query.username || '').trim()
  const clientSnapshotId = String(body.clientSnapshotId || query.clientSnapshotId || '').trim()

  if (!username || username.length > USERNAME_MAX_LENGTH || !USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: 'Invalid username' })
  }

  if (!clientSnapshotId || clientSnapshotId.length > SNAPSHOT_ID_MAX_LENGTH || !SNAPSHOT_ID_REGEX.test(clientSnapshotId)) {
    return res.status(400).json({ error: 'Invalid clientSnapshotId' })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()

    const { error } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('username', username)
      .eq('client_snapshot_id', clientSnapshotId)

    if (error) {
      // Surface the Postgres message: the common historical cause is the
      // `documents_prevent_delete` trigger, which has to be dropped (database.sql).
      return res.status(500).json({ error: 'Failed to delete snapshot', detail: error.message })
    }

    return res.status(200).json({ ok: true })
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}
