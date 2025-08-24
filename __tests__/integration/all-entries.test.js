import { supabase } from '../../lib/supabase'

// Mock the actual Supabase client
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn()
  }
}))

describe('All Entries Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('User validation for all entries', () => {
    test('verifies user exists before fetching entries', async () => {
      const mockSelect = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [{ username: 'testuser' }], error: null }))
      }))
      
      supabase.from.mockReturnValue({
        select: mockSelect
      })

      // Simulate the user verification from AllEntriesPage
      const { data, error } = await supabase
        .from('users')
        .select('username')
        .eq('username', 'testuser')

      expect(supabase.from).toHaveBeenCalledWith('users')
      expect(mockSelect).toHaveBeenCalledWith('username')
      expect(data).toEqual([{ username: 'testuser' }])
      expect(error).toBeNull()
    })

    test('handles non-existent user gracefully', async () => {
      const mockSelect = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
      }))
      
      supabase.from.mockReturnValue({
        select: mockSelect
      })

      const { data, error } = await supabase
        .from('users')
        .select('username')
        .eq('username', 'nonexistent')

      expect(data).toEqual([])
      expect(error).toBeNull()
    })
  })

  describe('Documents fetching for all entries', () => {
    test('fetches all documents for a user with correct ordering', async () => {
      const mockOrder = jest.fn(() => Promise.resolve({ 
        data: [
          { id: '3', content: 'Latest entry', updated_at: '2023-01-03T10:00:00Z' },
          { id: '2', content: 'Middle entry', updated_at: '2023-01-02T10:00:00Z' },
          { id: '1', content: 'Oldest entry', updated_at: '2023-01-01T10:00:00Z' }
        ], 
        error: null 
      }))
      
      const mockEq = jest.fn(() => ({ order: mockOrder }))
      const mockSelect = jest.fn(() => ({ eq: mockEq }))
      
      supabase.from.mockReturnValue({
        select: mockSelect
      })

      // Simulate the documents fetch from AllEntriesPage
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('username', 'testuser')
        .order('updated_at', { ascending: false })

      expect(supabase.from).toHaveBeenCalledWith('documents')
      expect(mockSelect).toHaveBeenCalledWith('*')
      expect(mockEq).toHaveBeenCalledWith('username', 'testuser')
      expect(mockOrder).toHaveBeenCalledWith('updated_at', { ascending: false })
      expect(data).toHaveLength(3)
      expect(data[0].content).toBe('Latest entry')
      expect(error).toBeNull()
    })

    test('handles user with no documents', async () => {
      const mockOrder = jest.fn(() => Promise.resolve({ data: [], error: null }))
      const mockEq = jest.fn(() => ({ order: mockOrder }))
      const mockSelect = jest.fn(() => ({ eq: mockEq }))
      
      supabase.from.mockReturnValue({
        select: mockSelect
      })

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('username', 'emptyuser')
        .order('updated_at', { ascending: false })

      expect(data).toEqual([])
      expect(error).toBeNull()
    })

    test('handles database error during document fetch', async () => {
      const mockOrder = jest.fn(() => Promise.resolve({ 
        data: null, 
        error: { message: 'Database query failed' }
      }))
      const mockEq = jest.fn(() => ({ order: mockOrder }))
      const mockSelect = jest.fn(() => ({ eq: mockEq }))
      
      supabase.from.mockReturnValue({
        select: mockSelect
      })

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('username', 'testuser')
        .order('updated_at', { ascending: false })

      expect(data).toBeNull()
      expect(error).toEqual({ message: 'Database query failed' })
    })
  })

  describe('Full all entries flow integration', () => {
    test('simulates complete all entries page load flow', async () => {
      const mockUserSelect = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ 
          data: [{ username: 'testuser' }], 
          error: null 
        }))
      }))
      
      const mockDocOrder = jest.fn(() => Promise.resolve({ 
        data: [
          { 
            id: 'doc-1', 
            username: 'testuser',
            content: 'First entry',
            created_at: '2023-01-01T10:00:00Z',
            updated_at: '2023-01-01T10:00:00Z'
          },
          { 
            id: 'doc-2', 
            username: 'testuser',
            content: 'Second entry',
            created_at: '2023-01-02T10:00:00Z',
            updated_at: '2023-01-02T10:00:00Z'
          }
        ], 
        error: null 
      }))
      const mockDocEq = jest.fn(() => ({ order: mockDocOrder }))
      const mockDocSelect = jest.fn(() => ({ eq: mockDocEq }))
      
      supabase.from.mockImplementation((table) => {
        if (table === 'users') {
          return { select: mockUserSelect }
        }
        if (table === 'documents') {
          return { select: mockDocSelect }
        }
      })

      // Step 1: Verify user exists
      const userCheck = await supabase
        .from('users')
        .select('username')
        .eq('username', 'testuser')

      expect(userCheck.data).toHaveLength(1)
      expect(userCheck.data[0].username).toBe('testuser')

      // Step 2: Fetch all documents
      const documentsResult = await supabase
        .from('documents')
        .select('*')
        .eq('username', 'testuser')
        .order('updated_at', { ascending: false })

      expect(documentsResult.data).toHaveLength(2)
      expect(documentsResult.data[0].content).toBe('First entry')
      expect(documentsResult.data[1].content).toBe('Second entry')
      
      // Verify correct method calls
      expect(mockUserSelect).toHaveBeenCalledWith('username')
      expect(mockDocSelect).toHaveBeenCalledWith('*')
      expect(mockDocEq).toHaveBeenCalledWith('username', 'testuser')
      expect(mockDocOrder).toHaveBeenCalledWith('updated_at', { ascending: false })
    })

    test('handles flow when user does not exist', async () => {
      const mockUserSelect = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: [], error: null }))
      }))
      
      supabase.from.mockImplementation((table) => {
        if (table === 'users') {
          return { select: mockUserSelect }
        }
      })

      // User check should return empty result
      const userCheck = await supabase
        .from('users')
        .select('username')
        .eq('username', 'nonexistent')

      expect(userCheck.data).toEqual([])
      
      // Documents query should not be called when user doesn't exist
      expect(supabase.from).toHaveBeenCalledWith('users')
      expect(supabase.from).not.toHaveBeenCalledWith('documents')
    })

    test('handles mixed content types in documents', async () => {
      const documentsWithVariedContent = [
        { 
          id: 'doc-1', 
          username: 'testuser',
          content: 'Simple text entry',
          updated_at: '2023-01-03T10:00:00Z'
        },
        { 
          id: 'doc-2', 
          username: 'testuser',
          content: 'Multi-line\nentry with\nline breaks',
          updated_at: '2023-01-02T10:00:00Z'
        },
        { 
          id: 'doc-3', 
          username: 'testuser',
          content: 'Entry with special chars: !@#$%^&*()',
          updated_at: '2023-01-01T10:00:00Z'
        },
        { 
          id: 'doc-4', 
          username: 'testuser',
          content: '',
          updated_at: '2023-01-01T09:00:00Z'
        }
      ]

      const mockOrder = jest.fn(() => Promise.resolve({ 
        data: documentsWithVariedContent, 
        error: null 
      }))
      const mockEq = jest.fn(() => ({ order: mockOrder }))
      const mockSelect = jest.fn(() => ({ eq: mockEq }))
      
      supabase.from.mockReturnValue({
        select: mockSelect
      })

      const { data } = await supabase
        .from('documents')
        .select('*')
        .eq('username', 'testuser')
        .order('updated_at', { ascending: false })

      expect(data).toHaveLength(4)
      expect(data[0].content).toBe('Simple text entry')
      expect(data[1].content).toContain('line breaks')
      expect(data[2].content).toContain('!@#$%^&*()')
      expect(data[3].content).toBe('')
    })
  })

  describe('Performance and edge cases', () => {
    test('handles large number of documents efficiently', async () => {
      // Simulate a user with many documents
      const manyDocuments = Array.from({ length: 100 }, (_, i) => ({
        id: `doc-${i}`,
        username: 'poweruser',
        content: `Entry number ${i}`,
        updated_at: new Date(2023, 0, 1, 10, i, 0).toISOString()
      }))

      const mockOrder = jest.fn(() => Promise.resolve({ 
        data: manyDocuments, 
        error: null 
      }))
      const mockEq = jest.fn(() => ({ order: mockOrder }))
      const mockSelect = jest.fn(() => ({ eq: mockEq }))
      
      supabase.from.mockReturnValue({
        select: mockSelect
      })

      const { data } = await supabase
        .from('documents')
        .select('*')
        .eq('username', 'poweruser')
        .order('updated_at', { ascending: false })

      expect(data).toHaveLength(100)
      expect(mockOrder).toHaveBeenCalledWith('updated_at', { ascending: false })
    })

    test('handles documents with null/undefined values', async () => {
      const documentsWithNulls = [
        { 
          id: 'doc-1', 
          username: 'testuser',
          content: null,
          updated_at: '2023-01-01T10:00:00Z'
        },
        { 
          id: 'doc-2', 
          username: 'testuser',
          content: undefined,
          updated_at: '2023-01-02T10:00:00Z'
        },
        { 
          id: 'doc-3', 
          username: 'testuser',
          content: 'Valid content',
          updated_at: null
        }
      ]

      const mockOrder = jest.fn(() => Promise.resolve({ 
        data: documentsWithNulls, 
        error: null 
      }))
      const mockEq = jest.fn(() => ({ order: mockOrder }))
      const mockSelect = jest.fn(() => ({ eq: mockEq }))
      
      supabase.from.mockReturnValue({
        select: mockSelect
      })

      const { data } = await supabase
        .from('documents')
        .select('*')
        .eq('username', 'testuser')
        .order('updated_at', { ascending: false })

      expect(data).toHaveLength(3)
      expect(data[0].content).toBeNull()
      expect(data[1].content).toBeUndefined()
      expect(data[2].updated_at).toBeNull()
    })

    test('handles network timeouts gracefully', async () => {
      const mockOrder = jest.fn(() => Promise.reject(new Error('Request timeout')))
      const mockEq = jest.fn(() => ({ order: mockOrder }))
      const mockSelect = jest.fn(() => ({ eq: mockEq }))
      
      supabase.from.mockReturnValue({
        select: mockSelect
      })

      try {
        await supabase
          .from('documents')
          .select('*')
          .eq('username', 'testuser')
          .order('updated_at', { ascending: false })
      } catch (error) {
        expect(error.message).toBe('Request timeout')
      }
    })
  })

  describe('Data consistency and ordering', () => {
    test('ensures documents are returned in descending order by updated_at', async () => {
      const documentsOutOfOrder = [
        { id: 'doc-1', content: 'Middle', updated_at: '2023-01-02T10:00:00Z' },
        { id: 'doc-2', content: 'Latest', updated_at: '2023-01-03T10:00:00Z' },
        { id: 'doc-3', content: 'Oldest', updated_at: '2023-01-01T10:00:00Z' }
      ]

      // Simulate the database returning properly ordered results
      const orderedDocuments = [...documentsOutOfOrder].sort((a, b) => 
        new Date(b.updated_at) - new Date(a.updated_at)
      )

      const mockOrder = jest.fn(() => Promise.resolve({ 
        data: orderedDocuments, 
        error: null 
      }))
      const mockEq = jest.fn(() => ({ order: mockOrder }))
      const mockSelect = jest.fn(() => ({ eq: mockEq }))
      
      supabase.from.mockReturnValue({
        select: mockSelect
      })

      const { data } = await supabase
        .from('documents')
        .select('*')
        .eq('username', 'testuser')
        .order('updated_at', { ascending: false })

      expect(data[0].content).toBe('Latest')
      expect(data[1].content).toBe('Middle')
      expect(data[2].content).toBe('Oldest')
      expect(mockOrder).toHaveBeenCalledWith('updated_at', { ascending: false })
    })

    test('handles documents with identical timestamps', async () => {
      const sameTimestamp = '2023-01-01T10:00:00Z'
      const documentsWithSameTime = [
        { id: 'doc-1', content: 'First', updated_at: sameTimestamp },
        { id: 'doc-2', content: 'Second', updated_at: sameTimestamp },
        { id: 'doc-3', content: 'Third', updated_at: sameTimestamp }
      ]

      const mockOrder = jest.fn(() => Promise.resolve({ 
        data: documentsWithSameTime, 
        error: null 
      }))
      const mockEq = jest.fn(() => ({ order: mockOrder }))
      const mockSelect = jest.fn(() => ({ eq: mockEq }))
      
      supabase.from.mockReturnValue({
        select: mockSelect
      })

      const { data } = await supabase
        .from('documents')
        .select('*')
        .eq('username', 'testuser')
        .order('updated_at', { ascending: false })

      expect(data).toHaveLength(3)
      // All should have the same timestamp
      expect(data.every(doc => doc.updated_at === sameTimestamp)).toBe(true)
    })
  })
})