/**
 * Client-side SHA-256 hash for password verification.
 * Passwords are hashed before sending to the DB; we never store plaintext.
 */

export async function hashPassword(password) {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyPassword(plainPassword, storedHash) {
  if (!storedHash) return false
  const hash = await hashPassword(plainPassword)
  return hash === storedHash
}
