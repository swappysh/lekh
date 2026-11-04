// Server-only. Counters live in Postgres (rate_limit_hit) because API routes run on
// many short-lived serverless instances that share no memory.

// IPv6 clients usually control a whole /64, so bucket on that prefix or each request
// could come from a fresh address and a fresh bucket.
function ipv6Prefix(address) {
  const [head, tail = ''] = address.split('::')
  const headGroups = head ? head.split(':') : []
  const tailGroups = tail ? tail.split(':') : []
  const missing = 8 - headGroups.length - tailGroups.length
  const groups = address.includes('::')
    ? [...headGroups, ...Array(missing).fill('0'), ...tailGroups]
    : headGroups
  return groups.slice(0, 4).map((group) => group.toLowerCase().replace(/^0+(?=.)/, '')).join(':')
}

function normalizeIp(ip) {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mapped) return mapped[1]
  return ip.includes(':') ? `${ipv6Prefix(ip)}::/64` : ip
}

// Trusted only behind Vercel, which overwrites x-forwarded-for (and x-real-ip) with
// the connecting client. Behind another proxy, or with `next start`, these headers
// are client controlled or missing, and everyone shares the 'unknown' bucket.
export function clientIp(req) {
  const realIp = req.headers?.['x-real-ip']
  if (realIp) return normalizeIp(String(realIp).trim())
  const forwarded = req.headers?.['x-forwarded-for']
  if (forwarded) return normalizeIp(String(forwarded).split(',')[0].trim())
  return 'unknown'
}

// Records one hit for `key`. Returns 0 while within `limit` hits per window, otherwise
// the seconds until the window resets. If the limiter itself fails the request is
// allowed (0): a database hiccup must not stop people from changing their password.
export async function rateLimitRetryAfter(supabaseAdmin, key, limit, windowSeconds) {
  const { data, error } = await supabaseAdmin.rpc('rate_limit_hit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    console.error('rate limit check failed, allowing the request:', error.message)
    return 0
  }
  return Number(data) || 0
}
