import { getSupabaseAdmin } from '../../lib/supabaseAdmin'
import { createChallenge, verifyChallenge, DELETE_ACTION } from '../../lib/rotateChallenge'
import {
  USERNAME_REGEX,
  USERNAME_MAX_LENGTH,
  SNAPSHOT_ID_REGEX,
  SNAPSHOT_ID_MAX_LENGTH,
  MAX_CHALLENGE_LENGTH,
} from '../../lib/constants'

// Companion to /api/private-append. Anyone may append to a private username, so a
// forged or empty snapshot needs a way out; the anon key cannot delete from
// documents (SELECT-only RLS), so this route goes through the service role.
//
// Unlike private-append this is NOT public: snapshot ids are world-readable, so an
// open delete would let anyone erase anyone's entries. A delete needs proof that the
// caller can decrypt with the owner's private key (the same challenge rotate-key uses):
//   step "challenge": { username }
//                     -> { encryptedChallenge, token }
//   step "commit":    { username, clientSnapshotId, token, challengeResponse }
//                     -> { ok: true }
// where challengeResponse is the nonce decrypted from encryptedChallenge.
// POST only: the proof must not travel in a query string.

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

  const clientSnapshotId = String(body.clientSnapshotId || '').trim()
  const token = String(body.token || '')
  const challengeResponse = String(body.challengeResponse || '')

  if (step === 'commit') {
    if (!clientSnapshotId || clientSnapshotId.length > SNAPSHOT_ID_MAX_LENGTH || !SNAPSHOT_ID_REGEX.test(clientSnapshotId)) {
      return res.status(400).json({ error: 'Invalid clientSnapshotId' })
    }

    if (!token || !challengeResponse) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    if (token.length > MAX_CHALLENGE_LENGTH || challengeResponse.length > MAX_CHALLENGE_LENGTH) {
      return res.status(413).json({ error: 'Field too large' })
    }
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
      return res.status(403).json({ error: 'Public users have no private entries to delete' })
    }

    if (step === 'challenge') {
      return res.status(200).json(createChallenge(username, user.public_key, Date.now(), DELETE_ACTION))
    }

    const proven = verifyChallenge({
      token,
      nonceBase64: challengeResponse,
      username,
      publicKeyBase64: user.public_key,
      action: DELETE_ACTION,
    })
    if (!proven) {
      return res.status(403).json({ error: 'Challenge failed or expired' })
    }

    const { error } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('username', username)
      .eq('client_snapshot_id', clientSnapshotId)

    if (error) {
      console.error('private-delete failed', error.message)
      return res.status(500).json({ error: 'Failed to delete snapshot' })
    }

    return res.status(200).json({ ok: true })
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}
