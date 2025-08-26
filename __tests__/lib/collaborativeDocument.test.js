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

  beforeEach(() => {
    jest.clearAllMocks()
    collaborativeDoc = new CollaborativeDocument('testuser')
  })

  describe('initialization', () => {
    test('creates collaborative document with correct properties', () => {
      expect(collaborativeDoc.username).toBe('testuser')
      expect(collaborativeDoc.content).toBe('')
      expect(collaborativeDoc.version).toBe(0)
      expect(collaborativeDoc.clientId).toBe('test-client-id')
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

      // The content should reflect the remote operation
      expect(collaborativeDoc.content).toBe('Hello beautiful world')
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

  describe('content management', () => {
    test('applies operations to content correctly', () => {
      collaborativeDoc.content = 'Hello world'
      
      const insertOp = new Operation('insert', 5, ' beautiful', 10, 'client1', 1)
      collaborativeDoc.applyOperation(insertOp)
      
      expect(collaborativeDoc.content).toBe('Hello beautiful world')
    })

    test('gets current content and version', () => {
      collaborativeDoc.content = 'test content'
      collaborativeDoc.version = 5
      
      expect(collaborativeDoc.getContent()).toBe('test content')
      expect(collaborativeDoc.getVersion()).toBe(5)
    })
  })

  describe('callback management', () => {
    test('sets and calls content change callback', () => {
      const callback = jest.fn()
      collaborativeDoc.setOnContentChange(callback)
      
      const operation = new Operation('insert', 0, 'Hello', 5, 'client1', 1)
      collaborativeDoc.applyOperation(operation)
      
      expect(callback).toHaveBeenCalledWith('Hello')
    })

    test('sets active editors change callback', () => {
      const callback = jest.fn()
      collaborativeDoc.setOnActiveEditorsChange(callback)
      
      expect(collaborativeDoc.onActiveEditorsChange).toBe(callback)
    })
  })
})