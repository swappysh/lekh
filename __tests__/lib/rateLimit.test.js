import { clientIp, rateLimitRetryAfter } from '../../lib/rateLimit'

describe('clientIp', () => {
  test('prefers x-real-ip', () => {
    expect(clientIp({ headers: { 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' } })).toBe('1.1.1.1')
  })

  test('falls back to the first x-forwarded-for entry', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '2.2.2.2, 3.3.3.3' } })).toBe('2.2.2.2')
  })

  test('falls back to unknown when no header is present', () => {
    expect(clientIp({ headers: {} })).toBe('unknown')
    expect(clientIp({})).toBe('unknown')
  })

  test('unwraps an IPv4-mapped IPv6 address', () => {
    expect(clientIp({ headers: { 'x-real-ip': '::ffff:203.0.113.9' } })).toBe('203.0.113.9')
  })

  test.each([
    ['full form', '2001:db8:1:2:aaaa:bbbb:cccc:dddd'],
    ['another host in the same /64', '2001:0DB8:0001:0002:0:0:0:1'],
    ['compressed', '2001:db8:1:2::1'],
  ])('buckets IPv6 by /64 prefix: %s', (_label, ip) => {
    expect(clientIp({ headers: { 'x-real-ip': ip } })).toBe('2001:db8:1:2::/64')
  })

  test('different /64 prefixes get different buckets', () => {
    expect(clientIp({ headers: { 'x-real-ip': '2001:db8:1:3::1' } })).toBe('2001:db8:1:3::/64')
  })

  test('expands :: when it falls inside the prefix', () => {
    expect(clientIp({ headers: { 'x-real-ip': '2001:db8::5' } })).toBe('2001:db8:0:0::/64')
    expect(clientIp({ headers: { 'x-real-ip': '::1' } })).toBe('0:0:0:0::/64')
  })
})

describe('rateLimitRetryAfter', () => {
  const admin = (result) => ({ rpc: jest.fn(() => Promise.resolve(result)) })

  test('passes key, limit and window to rate_limit_hit', async () => {
    const supabaseAdmin = admin({ data: 0, error: null })
    await rateLimitRetryAfter(supabaseAdmin, 'k', 5, 60)
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('rate_limit_hit', {
      p_key: 'k',
      p_limit: 5,
      p_window_seconds: 60,
    })
  })

  test('returns 0 while allowed and the seconds to wait once limited', async () => {
    expect(await rateLimitRetryAfter(admin({ data: 0, error: null }), 'k', 5, 60)).toBe(0)
    expect(await rateLimitRetryAfter(admin({ data: 42, error: null }), 'k', 5, 60)).toBe(42)
  })

  test('treats a NULL answer as allowed', async () => {
    expect(await rateLimitRetryAfter(admin({ data: null, error: null }), 'k', 5, 60)).toBe(0)
  })

  test('fails open when the database call errors', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(await rateLimitRetryAfter(admin({ data: null, error: { message: 'boom' } }), 'k', 5, 60)).toBe(0)
  })
})
