import { clientIp, withinRateLimit } from '../../lib/rateLimit'

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
})

describe('withinRateLimit', () => {
  const admin = (result) => ({ rpc: jest.fn(() => Promise.resolve(result)) })

  test('passes key, limit and window to rate_limit_hit', async () => {
    const supabaseAdmin = admin({ data: true, error: null })
    await withinRateLimit(supabaseAdmin, 'k', 5, 60)
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('rate_limit_hit', {
      p_key: 'k',
      p_limit: 5,
      p_window_seconds: 60,
    })
  })

  test('returns true while allowed and false once the function says no', async () => {
    expect(await withinRateLimit(admin({ data: true, error: null }), 'k', 5, 60)).toBe(true)
    expect(await withinRateLimit(admin({ data: false, error: null }), 'k', 5, 60)).toBe(false)
  })

  test('fails open when the database call errors', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(await withinRateLimit(admin({ data: null, error: { message: 'boom' } }), 'k', 5, 60)).toBe(true)
  })
})
