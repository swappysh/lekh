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
})
