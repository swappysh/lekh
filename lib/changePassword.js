import { PublicKeyEncryption } from './publicKeyEncryption'
import { supabase } from './supabase'
import { ROTATE_KEY_ROUTE, JSON_CONTENT_TYPE_HEADER, MIN_PASSWORD_LENGTH } from './constants'

const PAGE_SIZE = 1000

async function post(body) {
  const response = await fetch(ROTATE_KEY_ROUTE, {
    method: 'POST',
    headers: JSON_CONTENT_TYPE_HEADER,
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to change password')
  }
  return payload
}

// PostgREST caps a response at 1000 rows, so page through every entry.
async function fetchAllDataKeys(username) {
  const documents = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('documents')
      .select('id, encrypted_data_key')
      .eq('username', username)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error('Failed to load entries')
    documents.push(...data)
    if (data.length < PAGE_SIZE) return documents
  }
}

/**
 * Change the password by rotating the keypair. Old entries stay readable
 * because only their data keys are re-wrapped. Resolves with { skipped }, the
 * number of unreadable (junk) entries that were left as they were.
 */
export async function changePassword({ username, oldPassword, newPassword }) {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('encrypted_private_key, salt, is_public')
    .eq('username', username)
    .maybeSingle()

  if (error || !user) throw new Error('User not found')
  if (user.is_public) throw new Error('Public users have no password to change')

  let oldPrivateKey
  try {
    oldPrivateKey = await PublicKeyEncryption.unlockPrivateKey(
      oldPassword,
      user.encrypted_private_key,
      user.salt
    )
  } catch {
    throw new Error('Current password is incorrect')
  }

  const { encryptedChallenge, token } = await post({ step: 'challenge', username })
  const challengeResponse = await PublicKeyEncryption.decryptBase64WithPrivateKey(
    oldPrivateKey,
    encryptedChallenge
  )

  const documents = await fetchAllDataKeys(username)
  const rotation = await PublicKeyEncryption.prepareRotation({
    oldPrivateKey,
    newPassword,
    documents,
  })

  await post({
    step: 'commit',
    username,
    token,
    challengeResponse,
    publicKey: rotation.publicKey,
    encryptedPrivateKey: rotation.encryptedPrivateKey,
    salt: rotation.salt,
    dataKeys: rotation.dataKeys,
  })

  return { skipped: rotation.skipped }
}
