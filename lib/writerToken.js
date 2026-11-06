// Random per-session secret that proves a browser owns the snapshot id it keeps
// updating. The server stores only its sha256, so the public documents table
// never reveals it. 32 random bytes as base64url (43 chars).
export function newWriterToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
