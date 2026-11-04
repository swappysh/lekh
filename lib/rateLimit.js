// Server-only. Counters live in Postgres (rate_limit_hit) because API routes run on
// many short-lived serverless instances that share no memory.

// Vercel sets x-real-ip / overwrites x-forwarded-for with the connecting client.
export function clientIp(req) {
  const realIp = req.headers?.['x-real-ip']
  if (realIp) return String(realIp).trim()
  const forwarded = req.headers?.['x-forwarded-for']
  if (forwarded) return String(forwarded).split(',')[0].trim()
  return 'unknown'
}

// Records one hit for `key` and returns true while it is within `limit` hits per
// window. If the limiter itself fails the request is allowed: a database hiccup
// must not stop people from writing or changing their password.
export async function withinRateLimit(supabaseAdmin, key, limit, windowSeconds) {
  const { data, error } = await supabaseAdmin.rpc('rate_limit_hit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    console.error('rate limit check failed', error.message)
    return true
  }
  return data !== false
}
