import { CollaborativeDocument } from '../../lib/collaborativeDocument'
import { supabase } from '../../lib/supabase'
import { Operation } from '../../lib/operationalTransforms'

// Mock supabase
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn()
  }
}))

// Mock crypto.randomUUID
global.crypto.randomUUID = jest.fn(() => 'test-client-id')

describe('CollaborativeDocument', () => {
  let collaborativeDoc
  let mockChannel

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockChannel = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn()
    }
    
    supabase.channel.mockReturnValue(mockChannel)
    
    collaborativeDoc = new CollaborativeDocument('testuser')
  })

  afterEach(async () => {
    if (collaborativeDoc) {
      await collaborativeDoc.disconnect()
    }
  })

  describe('initialization', () => {
    test('creates collaborative document with correct properties', () => {
      expect(collaborativeDoc.username).toBe('testuser')
      expect(collaborativeDoc.content).toBe('')
      expect(collaborativeDoc.version).toBe(0)
      expect(collaborativeDoc.clientId).toBe('test-client-id')
      expect(collaborativeDoc.isConnected).toBe(false)
    })

    test('loads existing document on init', async () => {
      const mockDocument = {
        content: 'existing content',
        version: 5,
        updated_at: new Date()
      }

      supabase.from.mockImplementation((table) => {
        if (table === 'collaborative_documents') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn(() => Promise.resolve({ data: mockDocument, error: null }))
              }))
            }))
          }
        }
        if (table === 'active_editors') {
          return {
            upsert: jest.fn(() => Promise.resolve({ data: {}, error: null })),
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => Promise.resolve({ data: [], error: null }))
              }))
            }))
          }
        }
      })

      await collaborativeDoc.init()

      expect(collaborativeDoc.content).toBe('existing content')
      expect(collaborativeDoc.version).toBe(5)
      expect(collaborativeDoc.isConnected).toBe(true)
    })

    test('creates new document when none exists', async () => {
      const mockInsert = jest.fn(() => Promise.resolve({ data: { username: 'testuser', content: '', version: 0 }, error: null }))
      
      supabase.from.mockImplementation((table) => {
        if (table === 'collaborative_documents') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
              }))
            })),
            insert: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn(() => mockInsert())
              }))
            }))
          }
        }
        if (table === 'active_editors') {
          return {
            upsert: jest.fn(() => Promise.resolve({ data: {}, error: null })),
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => Promise.resolve({ data: [], error: null }))
              }))
            }))
          }
        }
      })

      await collaborativeDoc.init()

      expect(mockInsert).toHaveBeenCalled()
      expect(collaborativeDoc.content).toBe('')
      expect(collaborativeDoc.version).toBe(0)
    })
  })

  describe('realtime synchronization', () => {
    test('sets up realtime channel correctly', async () => {
      supabase.from.mockImplementation((table) => {
        if (table === 'collaborative_documents') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
              }))
            }))
          }
        }
        if (table === 'active_editors') {
          return {
            upsert: jest.fn(() => Promise.resolve({ data: {}, error: null })),
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => Promise.resolve({ data: [], error: null }))
              }))
            }))
          }
        }
      })

      await collaborativeDoc.init()

      expect(supabase.channel).toHaveBeenCalledWith('collab-testuser')
      expect(mockChannel.on).toHaveBeenCalledTimes(2)
      expect(mockChannel.subscribe).toHaveBeenCalled()
    })

    test('handles remote operations correctly', async () => {
      const contentChangeCallback = jest.fn()
      collaborativeDoc.setOnContentChange(contentChangeCallback)
      collaborativeDoc.content = 'initial content'

      const remoteOperation = {
        client_id: 'other-client',
        operation_type: 'insert',
        position: 7,
        content: ' added',
        length: null,
        version: 1
      }

      await collaborativeDoc.handleRemoteOperation(remoteOperation)

      expect(collaborativeDoc.content).toBe('initial added content')
      expect(contentChangeCallback).toHaveBeenCalledWith('initial added content')
    })

    test('ignores operations from same client', async () => {
      const contentChangeCallback = jest.fn()
      collaborativeDoc.setOnContentChange(contentChangeCallback)
      collaborativeDoc.content = 'initial content'

      const ownOperation = {
        client_id: 'test-client-id', // Same as our client ID
        operation_type: 'insert',
        position: 7,
        content: ' added',
        length: null,
        version: 1
      }

      await collaborativeDoc.handleRemoteOperation(ownOperation)

      expect(collaborativeDoc.content).toBe('initial content') // No change
      expect(contentChangeCallback).not.toHaveBeenCalled()
    })
  })

  describe('local operations', () => {
    test('handles local text changes and generates operations', async () => {
      const mockInsertOp = jest.fn(() => Promise.resolve({ data: {}, error: null }))
      const mockUpdateDoc = jest.fn(() => Promise.resolve({ data: {}, error: null }))
      
      supabase.from.mockImplementation((table) => {
        if (table === 'document_operations') {
          return {
            insert: mockInsertOp
          }
        }
        if (table === 'collaborative_documents') {
          return {
            update: jest.fn(() => ({
              eq: jest.fn(() => mockUpdateDoc())
            }))
          }
        }
        if (table === 'active_editors') {
          return {
            upsert: jest.fn(() => Promise.resolve({ data: {}, error: null }))
          }
        }
      })

      collaborativeDoc.content = 'Hello world'
      collaborativeDoc.version = 1

      await collaborativeDoc.handleLocalChange('Hello beautiful world', 15)

      expect(mockInsertOp).toHaveBeenCalled()
      expect(mockUpdateDoc).toHaveBeenCalled()
      expect(collaborativeDoc.content).toBe('Hello beautiful world')
    })

    test('updates cursor position without content changes', async () => {
      const mockUpsert = jest.fn(() => Promise.resolve({ data: {}, error: null }))
      
      supabase.from.mockImplementation((table) => {
        if (table === 'active_editors') {
          return {
            upsert: mockUpsert
          }
        }
      })

      collaborativeDoc.content = 'Hello world'
      
      await collaborativeDoc.handleLocalChange('Hello world', 5)

      expect(mockUpsert).toHaveBeenCalledWith({
        username: 'testuser',
        client_id: 'test-client-id',
        cursor_position: 5,
        last_seen: expect.any(Date)
      })
    })
  })

  describe('active editors management', () => {
    test('loads active editors correctly', async () => {
      const mockActiveEditors = [
        { client_id: 'client1', cursor_position: 5, last_seen: new Date() },
        { client_id: 'client2', cursor_position: 10, last_seen: new Date() }
      ]

      const activeEditorsCallback = jest.fn()
      collaborativeDoc.setOnActiveEditorsChange(activeEditorsCallback)

      supabase.from.mockImplementation((table) => {
        if (table === 'active_editors') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => Promise.resolve({ data: mockActiveEditors, error: null }))
              }))
            }))
          }
        }
      })

      await collaborativeDoc.loadActiveEditors()

      expect(activeEditorsCallback).toHaveBeenCalledWith(mockActiveEditors)
    })

    test('filters out own client from active editors', async () => {
      const mockActiveEditors = [
        { client_id: 'test-client-id', cursor_position: 0, last_seen: new Date() }, // Our client
        { client_id: 'other-client', cursor_position: 10, last_seen: new Date() }
      ]

      const activeEditorsCallback = jest.fn()
      collaborativeDoc.setOnActiveEditorsChange(activeEditorsCallback)

      supabase.from.mockImplementation((table) => {
        if (table === 'active_editors') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => Promise.resolve({ data: mockActiveEditors, error: null }))
              }))
            }))
          }
        }
      })

      await collaborativeDoc.loadActiveEditors()

      const expectedEditors = [{ client_id: 'other-client', cursor_position: 10, last_seen: expect.any(Date) }]
      expect(activeEditorsCallback).toHaveBeenCalledWith(expectedEditors)
    })

    test('joins as active editor on init', async () => {
      const mockUpsert = jest.fn(() => Promise.resolve({ data: {}, error: null }))

      supabase.from.mockImplementation((table) => {
        if (table === 'active_editors') {
          return {
            upsert: mockUpsert,
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gte: jest.fn(() => Promise.resolve({ data: [], error: null }))
              }))
            }))
          }
        }
      })

      await collaborativeDoc.joinAsActiveEditor()

      expect(mockUpsert).toHaveBeenCalledWith({
        username: 'testuser',
        client_id: 'test-client-id',
        cursor_position: 0,
        last_seen: expect.any(Date)
      })
    })

    test('leaves as active editor on disconnect', async () => {
      const mockDelete = jest.fn(() => Promise.resolve({ data: {}, error: null }))

      supabase.from.mockImplementation((table) => {
        if (table === 'active_editors') {
          return {
            delete: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => mockDelete())
              }))
            }))
          }
        }
      })

      await collaborativeDoc.disconnect()

      expect(mockDelete).toHaveBeenCalled()
      expect(collaborativeDoc.isConnected).toBe(false)
    })
  })

  describe('operational transforms integration', () => {
    test('transforms pending operations against remote operations', async () => {
      // Set up initial state
      collaborativeDoc.content = 'Hello world'
      collaborativeDoc.pendingOperations = [
        new Operation('insert', 11, '!', 1, 'test-client-id', 1)
      ]

      const remoteOperation = {
        client_id: 'other-client',
        operation_type: 'insert',
        position: 5,
        content: ' beautiful',
        version: 1
      }

      await collaborativeDoc.handleRemoteOperation(remoteOperation)

      // The content should reflect both operations properly transformed
      expect(collaborativeDoc.content).toBe('Hello beautiful world')
    })

    test('applies operations in correct order', async () => {
      collaborativeDoc.content = 'abc'
      
      // Simulate receiving multiple remote operations
      const ops = [
        { client_id: 'client1', operation_type: 'insert', position: 1, content: 'X', version: 1 },
        { client_id: 'client2', operation_type: 'insert', position: 2, content: 'Y', version: 2 }
      ]

      for (const op of ops) {
        await collaborativeDoc.handleRemoteOperation(op)
      }

      // Final content should be properly transformed
      expect(collaborativeDoc.content).toBe('aXbYc')
    })
  })

  describe('error handling', () => {
    test('handles database errors gracefully', async () => {
      supabase.from.mockImplementation(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ data: null, error: { message: 'Database error' } }))
          }))
        }))
      }))

      // Should not throw
      await expect(collaborativeDoc.loadDocument()).resolves.not.toThrow()
    })

    test('handles operation sending failures', async () => {
      supabase.from.mockImplementation(() => ({
        insert: jest.fn(() => Promise.resolve({ data: null, error: { message: 'Insert failed' } }))
      }))

      const operation = new Operation('insert', 0, 'test', 4, 'test-client-id', 1)
      const result = await collaborativeDoc.sendOperation(operation)

      expect(result).toBe(false)
      expect(collaborativeDoc.pendingOperations).toHaveLength(0) // Should be cleaned up
    })
  })
})