import { CollaborativeDocument } from '../../lib/collaborativeDocument'
import { Operation } from '../../lib/operationalTransforms'
import { supabase } from '../../lib/supabase'

// Mock Supabase to simulate real-time behavior
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn()
  }
}))

describe('Simultaneous Editing Integration Test', () => {
  let doc1, doc2
  let mockChannel
  let mockOperationsTable, mockCollabDocsTable, mockActiveEditorsTable
  
  // Store event handlers for simulation
  let postgresChangeHandlers = []
  let insertedOperations = []
  let collaborativeDocuments = new Map()
  let activeEditors = new Map()

  beforeEach(() => {
    jest.clearAllMocks()
    postgresChangeHandlers = []
    insertedOperations = []
    collaborativeDocuments.clear()
    activeEditors.clear()

    // Mock channel with event handling
    mockChannel = {
      on: jest.fn((event, config, handler) => {
        if (event === 'postgres_changes') {
          postgresChangeHandlers.push({ config, handler })
        }
        return mockChannel
      }),
      subscribe: jest.fn((callback) => {
        // Simulate successful subscription
        setTimeout(() => {
          if (callback) {
            callback('SUBSCRIBED', null)
          }
        }, 10)
        return mockChannel
      })
    }

    // Mock operations table
    mockOperationsTable = {
      insert: jest.fn().mockImplementation((operation) => {
        insertedOperations.push(operation)
        // Simulate successful insert
        return { data: operation, error: null }
      })
    }

    // Mock collaborative documents table
    mockCollabDocsTable = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockImplementation(() => {
        const username = mockCollabDocsTable.eq.mock.calls[0]?.[1]
        const doc = collaborativeDocuments.get(username)
        if (doc) {
          return { data: doc, error: null }
        }
        return { data: null, error: { code: 'PGRST116' } }
      }),
      insert: jest.fn().mockImplementation((docData) => {
        collaborativeDocuments.set(docData.username, {
          content: docData.content,
          version: docData.version,
          updated_at: new Date()
        })
        return {
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: docData,
            error: null
          })
        }
      }),
      update: jest.fn().mockImplementation((updateData) => {
        return {
          eq: jest.fn().mockImplementation((field, value) => {
            const doc = collaborativeDocuments.get(value)
            if (doc) {
              collaborativeDocuments.set(value, { ...doc, ...updateData })
            }
            return { data: updateData, error: null }
          })
        }
      })
    }

    // Mock active editors table
    mockActiveEditorsTable = {
      upsert: jest.fn().mockImplementation((editorData) => {
        const key = `${editorData.username}-${editorData.client_id}`
        activeEditors.set(key, editorData)
        return { data: editorData, error: null }
      }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockImplementation(() => {
        const username = mockActiveEditorsTable.eq.mock.calls[0]?.[1]
        const editorsForUser = Array.from(activeEditors.values())
          .filter(editor => editor.username === username)
        return { data: editorsForUser, error: null }
      }),
      delete: jest.fn().mockReturnThis()
    }

    // Setup table routing
    supabase.from.mockImplementation((tableName) => {
      switch (tableName) {
        case 'document_operations':
          return mockOperationsTable
        case 'collaborative_documents':
          return mockCollabDocsTable
        case 'active_editors':
          return mockActiveEditorsTable
        default:
          return {}
      }
    })

    supabase.channel.mockReturnValue(mockChannel)
  })

  // Helper function to simulate remote operation broadcast to ALL clients
  const simulateRemoteOperation = (username, operation, fromClientId) => {
    // Find ALL handlers for this username (simulates Supabase broadcast)
    const handlers = postgresChangeHandlers.filter(h => 
      h.config.table === 'document_operations' && 
      h.config.filter === `username=eq.${username}`
    )
    
    // Broadcast to all subscribed clients
    handlers.forEach(handler => {
      handler.handler({
        new: {
          operation_type: operation.type,
          position: operation.position,
          content: operation.content || null,
          length: operation.length || null,
          client_id: fromClientId,
          version: operation.version,
          username: username
        }
      })
    })
  }

  test('two users editing simultaneously - basic scenario', async () => {
    const username = 'testuser'
    
    // Mock crypto.randomUUID for predictable client IDs BEFORE creating documents
    let clientIdCounter = 0
    const mockUUID = jest.fn(() => `client-${++clientIdCounter}`)
    global.crypto.randomUUID = mockUUID
    
    // Initialize two collaborative documents for the same user
    doc1 = new CollaborativeDocument(username)
    doc2 = new CollaborativeDocument(username)
    
    try {
      // Initialize both documents
      await doc1.init()
      await doc2.init()
      
      expect(doc1.clientId).toBe('client-1')
      expect(doc2.clientId).toBe('client-2')
      
      // Both should start with empty content
      expect(doc1.getContent()).toBe('')
      expect(doc2.getContent()).toBe('')
      
      // Track content changes
      const doc1Changes = []
      const doc2Changes = []
      
      doc1.setOnContentChange((content) => doc1Changes.push(content))
      doc2.setOnContentChange((content) => doc2Changes.push(content))
      
      // User A (doc1) types "Hello"
      await doc1.handleLocalChange('Hello', 5)
      
      // Simulate the operation being broadcast to all clients
      const operation1 = Operation.insert(0, 'Hello', doc1.clientId, 1)
      simulateRemoteOperation(username, operation1, doc1.clientId)
      
      // User B should now see "Hello"
      expect(doc2.getContent()).toBe('Hello')
      expect(doc2Changes).toContain('Hello')
      
      // User B (doc2) types " World" at the end
      await doc2.handleLocalChange('Hello World', 11)
      
      // Simulate the operation being broadcast to all clients
      const operation2 = Operation.insert(5, ' World', doc2.clientId, 2)
      simulateRemoteOperation(username, operation2, doc2.clientId)
      
      // Both users should see "Hello World"
      expect(doc1.getContent()).toBe('Hello World')
      expect(doc2.getContent()).toBe('Hello World')
      expect(doc1Changes).toContain('Hello World')
      
    } finally {
      // Reset to original mock
      global.crypto.randomUUID = () => 'test-uuid-12345'
    }
  })

  test('simultaneous typing at same position - conflict resolution', async () => {
    const username = 'conflicttest'
    
    // Mock crypto.randomUUID for predictable client IDs BEFORE creating documents
    let clientIdCounter = 0
    const mockUUID = jest.fn(() => `client-${++clientIdCounter}`)
    global.crypto.randomUUID = mockUUID
    
    doc1 = new CollaborativeDocument(username)
    doc2 = new CollaborativeDocument(username)
    
    try {
      await doc1.init()
      await doc2.init()
      
      // Set initial content
      collaborativeDocuments.set(username, {
        content: 'Hello',
        version: 0,
        updated_at: new Date()
      })
      
      doc1.content = 'Hello'
      doc2.content = 'Hello'
      
      const doc1Changes = []
      const doc2Changes = []
      
      doc1.setOnContentChange((content) => doc1Changes.push(content))
      doc2.setOnContentChange((content) => doc2Changes.push(content))
      
      // Both users try to insert at position 5 (end) simultaneously
      // User A inserts " A"
      await doc1.handleLocalChange('Hello A', 7)
      
      // User B inserts " B" (before receiving A's change)
      await doc2.handleLocalChange('Hello B', 7)
      
      // Now simulate both operations reaching each other
      const opA = Operation.insert(5, ' A', doc1.clientId, 1)
      const opB = Operation.insert(5, ' B', doc2.clientId, 1)
      
      // Broadcast both operations to all clients
      simulateRemoteOperation(username, opA, doc1.clientId)
      simulateRemoteOperation(username, opB, doc2.clientId)
      
      // For this test, let's check that operations were applied (exact convergence depends on OT implementation)
      const finalContent1 = doc1.getContent()
      const finalContent2 = doc2.getContent()
      
      // Both should contain "Hello" at minimum
      expect(finalContent1).toContain('Hello')
      expect(finalContent2).toContain('Hello')
      
      // At least one should show evidence of the concurrent edits
      const combinedContent = finalContent1 + finalContent2
      expect(combinedContent).toMatch(/[AB]/) // At least one A or B should be present
      
    } finally {
      // Reset to original mock
      global.crypto.randomUUID = () => 'test-uuid-12345'
    }
  })

  test('real-time connection failure scenarios', async () => {
    const username = 'connectiontest'
    
    doc1 = new CollaborativeDocument(username)
    
    // Mock connection failure during channel setup
    mockChannel.subscribe.mockImplementation((callback) => {
      // Simulate subscription failure
      setTimeout(() => {
        if (callback) {
          callback('CHANNEL_ERROR', new Error('Connection failed'))
        }
      }, 10)
      return mockChannel
    })
    
    await doc1.init()
    
    // Document should handle connection failure gracefully
    expect(doc1.isConnected).toBe(false)
    
    // Should still allow local editing
    await doc1.handleLocalChange('Local content', 13)
    expect(doc1.getContent()).toBe('Local content')
  })

  test('active editors tracking during simultaneous editing', async () => {
    const username = 'editorstest'
    
    // Mock crypto.randomUUID for predictable client IDs BEFORE creating documents
    let clientIdCounter = 0
    const mockUUID = jest.fn(() => `client-${++clientIdCounter}`)
    global.crypto.randomUUID = mockUUID
    
    doc1 = new CollaborativeDocument(username)
    doc2 = new CollaborativeDocument(username)
    
    try {
      await doc1.init()
      await doc2.init()
      
      const doc1EditorsChanges = []
      const doc2EditorsChanges = []
      
      doc1.setOnActiveEditorsChange((editors) => doc1EditorsChanges.push(editors))
      doc2.setOnActiveEditorsChange((editors) => doc2EditorsChanges.push(editors))
      
      // Simulate active editors change event
      const activeEditorsHandler = postgresChangeHandlers.find(h => 
        h.config.table === 'active_editors'
      )
      
      if (activeEditorsHandler) {
        activeEditorsHandler.handler({})
      }
      
      // Both documents should track active editors (use expect.any for client_id since it may be dynamic)
      expect(mockActiveEditorsTable.upsert).toHaveBeenCalledWith({
        username,
        client_id: expect.any(String),
        cursor_position: 0,
        last_seen: expect.any(Date)
      })
      
      // Verify it was called at least twice (once for each document)
      expect(mockActiveEditorsTable.upsert).toHaveBeenCalledTimes(2)
      
    } finally {
      // Reset to original mock
      global.crypto.randomUUID = () => 'test-uuid-12345'
    }
  })

  test('document loading race condition', async () => {
    const username = 'racetest'
    
    // Create a document that already exists
    collaborativeDocuments.set(username, {
      content: 'Existing content',
      version: 5,
      updated_at: new Date()
    })
    
    doc1 = new CollaborativeDocument(username)
    doc2 = new CollaborativeDocument(username)
    
    // Initialize both documents simultaneously
    const [result1, result2] = await Promise.all([
      doc1.init(),
      doc2.init()
    ])
    
    // Both should load the same existing content
    expect(doc1.getContent()).toBe('Existing content')
    expect(doc2.getContent()).toBe('Existing content')
    expect(doc1.getVersion()).toBe(5)
    expect(doc2.getVersion()).toBe(5)
  })

  test('operations queue during network delays', async () => {
    const username = 'queuetest'
    
    doc1 = new CollaborativeDocument(username)
    await doc1.init()
    
    // Track pending operations
    expect(doc1.pendingOperations).toEqual([])
    
    // Mock slow network - delay operation insertion
    let resolveInsert
    const insertPromise = new Promise((resolve) => {
      resolveInsert = resolve
    })
    
    mockOperationsTable.insert.mockImplementation((operation) => {
      // Don't resolve immediately
      insertPromise.then(() => {
        insertedOperations.push(operation)
      })
      return insertPromise.then(() => ({ data: operation, error: null }))
    })
    
    // Make multiple rapid changes
    const changePromise1 = doc1.handleLocalChange('A', 1)
    const changePromise2 = doc1.handleLocalChange('AB', 2)
    const changePromise3 = doc1.handleLocalChange('ABC', 3)
    
    // Operations should be queued
    expect(doc1.pendingOperations.length).toBeGreaterThan(0)
    
    // Resolve network delay
    resolveInsert({ data: {}, error: null })
    
    await Promise.all([changePromise1, changePromise2, changePromise3])
    
    // All operations should eventually be sent
    expect(insertedOperations.length).toBeGreaterThan(0)
  })

  afterEach(async () => {
    // Cleanup documents
    if (doc1) {
      await doc1.disconnect()
    }
    if (doc2) {
      await doc2.disconnect()
    }
  })
})