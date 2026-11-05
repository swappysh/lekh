import { newWriterToken } from '../../lib/writerToken'
import { WRITER_TOKEN_REGEX } from '../../lib/constants'

describe('newWriterToken', () => {
  test('is url safe, accepted by the route, and different every call', () => {
    const a = newWriterToken()
    const b = newWriterToken()

    expect(a).toMatch(WRITER_TOKEN_REGEX)
    expect(a).toHaveLength(43)
    expect(a).not.toBe(b)
  })

  test('maps + and / to - and _ and strips padding', () => {
    const spy = jest.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      array.fill(0xfb)
      array[1] = 0xff
      array[2] = 0xbf
      return array
    })

    const token = newWriterToken()
    spy.mockRestore()

    // 0xfb 0xff 0xbf encodes to "-_-_" after the url safe mapping.
    expect(token.startsWith('-_-_')).toBe(true)
    expect(token).not.toMatch(/[+/=]/)
    expect(token).toHaveLength(43)
  })
})
