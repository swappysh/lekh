import '@testing-library/jest-dom'

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: jest.fn(),
      replace: jest.fn(),
    }
  },
}))

// Mock TextEncoder and TextDecoder first (needed by crypto mocks)
global.TextEncoder = class TextEncoder {
  encode(string) {
    return new Uint8Array(Buffer.from(string, 'utf8'))
  }
}

global.TextDecoder = class TextDecoder {
  decode(uint8Array) {
    return Buffer.from(uint8Array).toString('utf8')
  }
}

// Mock crypto APIs including WebCrypto for encryption tests
const mockCrypto = {
  randomUUID: () => 'test-uuid-12345',
  getRandomValues: jest.fn((array) => {
    // Fill with truly random values for each call  
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256)
    }
    return array
  }),
  subtle: {
    importKey: jest.fn(() => Promise.resolve({ type: 'secret', algorithm: 'PBKDF2' })),
    deriveKey: jest.fn(() => Promise.resolve({ type: 'secret', algorithm: 'AES-GCM' })),
    encrypt: jest.fn(() => {
      // Return a deterministic encrypted result
      const result = new ArrayBuffer(32) // 32 bytes for test
      const view = new Uint8Array(result)
      for (let i = 0; i < view.length; i++) {
        view[i] = (i + 100) % 256 // Deterministic "encrypted" data
      }
      return Promise.resolve(result)
    }),
    decrypt: jest.fn((algorithm, key, data) => {
      // Return "decrypted content" as ArrayBuffer
      const encoder = new TextEncoder()
      return Promise.resolve(encoder.encode('decrypted content').buffer)
    })
  }
}

// Set up crypto globally
Object.defineProperty(global, 'crypto', {
  value: mockCrypto,
  writable: true,
  enumerable: true,
  configurable: true
})

// Mock Supabase
jest.mock('./lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
      })),
      upsert: jest.fn(() => Promise.resolve({ data: {}, error: null }))
    }))
  }
}))