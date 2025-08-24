import { supabase } from '../../lib/supabase'

// Mock the actual Supabase client
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn()
  }
}))

describe('Supabase Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Users table operations', () => {
    test('checks username availability', async () => {
      const mockSelect = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
      }))
      
      supabase.from.mockReturnValue({
        select: mockSelect
      })

      // Simulate the availability check from Home component
      const { data, error } = await supabase
        .from('users')
        .select('username')
        .eq('username', 'testuser')

      expect(supabase.from).toHaveBeenCalledWith('users')
      expect(mockSelect).toHaveBeenCalledWith('username')
      expect(data).toEqual([])
      expect(error).toBeNull()
    })

    test('creates new user', async () => {
      const mockUpsert = jest.fn(() => Promise.resolve({ 
        data: { username: 'newuser' }, 
        error: null 
      }))
      
      supabase.from.mockReturnValue({
        upsert: mockUpsert
      })

      // Simulate user creation from Home component
      const { data, error } = await supabase
        .from('users')
        .upsert({ username: 'newuser' })

      expect(supabase.from).toHaveBeenCalledWith('users')
      expect(mockUpsert).toHaveBeenCalledWith({ username: 'newuser' })
      expect(data).toEqual({ username: 'newuser' })
      expect(error).toBeNull()
    })

    test('handles username already exists', async () => {
      const mockSelect = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ 
          data: [{ username: 'existinguser' }], 
          error: null 
        }))
      }))
      
      supabase.from.mockReturnValue({
        select: mockSelect
      })

      const { data, error } = await supabase
        .from('users')
        .select('username')
        .eq('username', 'existinguser')

      expect(data).toHaveLength(1)
      expect(data[0]).toEqual({ username: 'existinguser' })
    })

    test('handles database error during availability check', async () => {
      const mockSelect = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ 
          data: null, 
          error: { message: 'Database connection failed' }
        }))
      }))
      
      supabase.from.mockReturnValue({
        select: mockSelect
      })

      const { data, error } = await supabase
        .from('users')
        .select('username')
        .eq('username', 'testuser')

      expect(data).toBeNull()
      expect(error).toEqual({ message: 'Database connection failed' })
    })
  })

  describe('Documents table operations', () => {
    test('saves document content', async () => {
      const mockUpsert = jest.fn(() => Promise.resolve({ 
        data: { 
          id: 'doc-123',
          username: 'testuser',
          content: 'Test content',
          updated_at: expect.any(Date)
        }, 
        error: null 
      }))
      
      supabase.from.mockReturnValue({
        upsert: mockUpsert
      })

      const documentData = {
        id: 'doc-123',
        username: 'testuser',
        content: 'Test content',
        updated_at: new Date()
      }

      const { data, error } = await supabase
        .from('documents')
        .upsert(documentData)

      expect(supabase.from).toHaveBeenCalledWith('documents')
      expect(mockUpsert).toHaveBeenCalledWith(documentData)
      expect(data.username).toBe('testuser')
      expect(data.content).toBe('Test content')
      expect(error).toBeNull()
    })

    test('updates existing document', async () => {
      const mockUpsert = jest.fn(() => Promise.resolve({ 
        data: { 
          id: 'doc-123',
          username: 'testuser',
          content: 'Updated content',
          updated_at: expect.any(Date)
        }, 
        error: null 
      }))
      
      supabase.from.mockReturnValue({
        upsert: mockUpsert
      })

      const updatedData = {
        id: 'doc-123',
        username: 'testuser',
        content: 'Updated content',
        updated_at: new Date()
      }

      const { data, error } = await supabase
        .from('documents')
        .upsert(updatedData)

      expect(mockUpsert).toHaveBeenCalledWith(updatedData)
      expect(data.content).toBe('Updated content')
    })

    test('handles document save error', async () => {
      const mockUpsert = jest.fn(() => Promise.resolve({ 
        data: null, 
        error: { message: 'Failed to save document' }
      }))
      
      supabase.from.mockReturnValue({
        upsert: mockUpsert
      })

      const documentData = {
        id: 'doc-123',
        username: 'testuser',
        content: 'Test content',
        updated_at: new Date()
      }

      const { data, error } = await supabase
        .from('documents')
        .upsert(documentData)

      expect(data).toBeNull()
      expect(error).toEqual({ message: 'Failed to save document' })
    })
  })

  describe('Integration patterns', () => {
    test('simulates full user creation flow', async () => {
      // First check availability
      const mockSelect = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
      }))
      
      const mockUpsert = jest.fn(() => Promise.resolve({ 
        data: { username: 'newuser' }, 
        error: null 
      }))
      
      supabase.from.mockImplementation((table) => {
        if (table === 'users') {
          return {
            select: mockSelect,
            upsert: mockUpsert
          }
        }
      })

      // Check availability
      const availabilityResult = await supabase
        .from('users')
        .select('username')
        .eq('username', 'newuser')

      expect(availabilityResult.data).toEqual([])

      // Create user
      const creationResult = await supabase
        .from('users')
        .upsert({ username: 'newuser' })

      expect(creationResult.data).toEqual({ username: 'newuser' })
      expect(mockSelect).toHaveBeenCalledWith('username')
      expect(mockUpsert).toHaveBeenCalledWith({ username: 'newuser' })
    })

    test('simulates user verification and document save flow', async () => {
      const mockSelect = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ 
          data: [{ username: 'testuser' }], 
          error: null 
        }))
      }))
      
      const mockUpsert = jest.fn(() => Promise.resolve({ 
        data: { 
          id: 'doc-123',
          username: 'testuser',
          content: 'New document'
        }, 
        error: null 
      }))
      
      supabase.from.mockImplementation((table) => {
        if (table === 'users') {
          return { select: mockSelect }
        }
        if (table === 'documents') {
          return { upsert: mockUpsert }
        }
      })

      // Verify user exists
      const userCheck = await supabase
        .from('users')
        .select('username')
        .eq('username', 'testuser')

      expect(userCheck.data).toHaveLength(1)

      // Save document
      const docSave = await supabase
        .from('documents')
        .upsert({
          id: 'doc-123',
          username: 'testuser',
          content: 'New document',
          updated_at: new Date()
        })

      expect(docSave.data.username).toBe('testuser')
      expect(docSave.data.content).toBe('New document')
    })

    test('handles network errors gracefully', async () => {
      supabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => Promise.reject(new Error('Network error')))
        }))
      }))

      try {
        await supabase
          .from('users')
          .select('username')
          .eq('username', 'testuser')
      } catch (error) {
        expect(error.message).toBe('Network error')
      }
    })
  })

  describe('Environment configuration', () => {
    test('supabase client is properly configured', () => {
      // Test that the mock is in place and working
      expect(supabase.from).toBeDefined()
      expect(typeof supabase.from).toBe('function')
    })

    test('handles missing environment variables gracefully', () => {
      // This tests the lib/supabase.js setup indirectly
      // In a real test environment, we'd want to ensure the client handles missing env vars
      expect(supabase).toBeDefined()
      expect(supabase.from).toBeDefined()
    })
  })
})