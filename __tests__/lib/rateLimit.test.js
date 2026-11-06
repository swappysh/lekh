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

  test.each([
    ['dotted', '::ffff:203.0.113.9'],
    ['hex', '::ffff:cb00:7109'],
    ['full form dotted', '0:0:0:0:0:ffff:203.0.113.9'],
    ['full form hex', '0000:0000:0000:0000:0000:FFFF:cb00:7109'],
    ['an IPv4 address with a port', '203.0.113.9:5678'],
    ['a bracketed IPv4-mapped address with a port', '[::ffff:203.0.113.9]:443'],
  ])('reduces %s to the bare IPv4 address', (_label, ip) => {
    expect(clientIp({ headers: { 'x-real-ip': ip } })).toBe('203.0.113.9')
  })

  test('strips brackets and port from an IPv6 address before bucketing', () => {
    expect(clientIp({ headers: { 'x-real-ip': '[2001:db8:1:2::1]:443' } })).toBe('2001:db8:1:2::/64')
  })

  test.each([
    ['full form', '2001:db8:1:2:aaaa:bbbb:cccc:dddd'],
    ['another host in the same /64', '2001:0DB8:0001:0002:0:0:0:1'],
    ['compressed', '2001:db8:1:2::1'],
  ])('buckets IPv6 by /64 prefix: %s', (_label, ip) => {
    expect(clientIp({ headers: { 'x-real-ip': ip } })).toBe('2001:db8:1:2::/64')
  })

  test.each([
    ['too many groups before ::', '1:2:3:4:5:6:7:8:9::'],
    ['too many groups around ::', '1:2:3:4:5:6:7:8::1'],
    ['garbage', 'not-an-ip'],
    ['unbalanced bracket', '[::1'],
    ['a very long string', 'a:'.repeat(50000)],
  ])('never throws on %s', (_label, ip) => {
    expect(() => clientIp({ headers: { 'x-real-ip': ip } })).not.toThrow()
  })

  test.each([
    ['text with spaces', 'evil key with spaces'],
    ['a list in one header', '1.2.3.4 5.6.7.8'],
    ['a very long string', 'a'.repeat(8000)],
    ['an IPv4 address with a leading zero', '001.002.003.004'],
    ['an out of range octet', '999.1.1.1'],
  ])('puts %s in the shared unknown bucket instead of making a new key', (_label, value) => {
    expect(clientIp({ headers: { 'x-real-ip': value } })).toBe('unknown')
  })

  test('ignores a whitespace-only x-real-ip and uses x-forwarded-for', () => {
    expect(clientIp({ headers: { 'x-real-ip': '   ', 'x-forwarded-for': '2.2.2.2' } })).toBe('2.2.2.2')
    expect(clientIp({ headers: { 'x-real-ip': '   ' } })).toBe('unknown')
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

  let consoleError

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

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

  test.each([
    ['NULL', null],
    ['an older boolean answer true', true],
    ['an older boolean answer false', false],
  ])('treats %s as allowed instead of reading it as seconds', async (_label, data) => {
    expect(await rateLimitRetryAfter(admin({ data, error: null }), 'k', 5, 60)).toBe(0)
    expect(consoleError).toHaveBeenCalled()
  })

  test('fails open when the database call errors', async () => {
    expect(await rateLimitRetryAfter(admin({ data: null, error: { message: 'boom' } }), 'k', 5, 60)).toBe(0)
    expect(consoleError).toHaveBeenCalled()
  })
})
