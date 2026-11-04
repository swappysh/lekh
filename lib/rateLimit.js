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

// Header values are normally a bare address, but tolerate `[v6]:port` and `v4:port`
// so a port cannot mint a fresh bucket per request.
function stripPortAndBrackets(ip) {
  const bracketed = ip.match(/^\[(.+)\](?::\d+)?$/)
  if (bracketed) return bracketed[1]
  const withPort = ip.match(/^(\d+\.\d+\.\d+\.\d+):\d+$/)
  return withPort ? withPort[1] : ip
}

function mappedIpv4(ip) {
  const dotted = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (dotted) return dotted[1]
  const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (!hex) return null
  const [high, low] = [parseInt(hex[1], 16), parseInt(hex[2], 16)]
  return [high >> 8, high & 255, low >> 8, low & 255].join('.')
}

function normalizeIp(rawIp) {
  const ip = stripPortAndBrackets(rawIp)
  const ipv4 = mappedIpv4(ip)
  if (ipv4) return ipv4
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
// the seconds until the window resets. If the limiter itself fails, or answers with
// anything but a number (for example an older boolean version of the function), the
// request is allowed (0): a database hiccup must not stop people from changing their
// password, and a boolean must never be read as seconds.
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
  if (typeof data !== 'number') {
    console.error('rate limit check returned a non-number, allowing the request:', data)
    return 0
  }
  return data
}
