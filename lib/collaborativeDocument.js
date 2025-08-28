import { supabase } from './supabase'
import { Operation, OperationalTransforms } from './operationalTransforms'

export class CollaborativeDocument {
  constructor(username) {
    this.username = username
    this.content = ''
    this.version = 0
    this.clientId = crypto.randomUUID()
    this.pendingOperations = []
    this.isConnected = false
    this.channel = null
    this.onContentChange = null
    this.onActiveEditorsChange = null
    this.lastCursorPosition = 0
  }

  // Initialize collaborative document
  async init() {
    try {
      await this.loadDocument()
      await this.setupRealtimeSync()
      await this.joinAsActiveEditor()
      this.isConnected = true
    } catch (error) {
      console.warn('Failed to initialize collaborative document:', error.message)
      this.isConnected = false
      // Still allow local editing even if realtime fails
      await this.joinAsActiveEditor()
    }
  }

  // Load existing document or create new one
  async loadDocument() {
    const { data, error } = await supabase
      .from('collaborative_documents')
      .select('content, version, updated_at')
      .eq('username', this.username)
      .single()

    if (data) {
      this.content = data.content
      this.version = data.version
    } else if (error?.code === 'PGRST116') {
      // Document doesn't exist, create it
      await this.createDocument()
    } else if (error) {
      console.error('Error loading collaborative document:', error)
    }
  }

  // Create new collaborative document
  async createDocument() {
    const { data, error } = await supabase
      .from('collaborative_documents')
      .insert({
        username: this.username,
        content: '',
        version: 0
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating collaborative document:', error)
    } else {
      this.content = ''
      this.version = 0
    }
  }

  // Setup realtime synchronization
  setupRealtimeSync() {
    return new Promise((resolve, reject) => {
      this.channel = supabase
        .channel(`collab-${this.username}`, {
          config: {
            presence: { key: this.clientId }
          }
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'document_operations',
            filter: `username=eq.${this.username}`
          },
          (payload) => {
            this.handleRemoteOperation(payload.new)
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'active_editors',
            filter: `username=eq.${this.username}`
          },
          (payload) => {
            this.loadActiveEditors()
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            console.log(`Realtime channel subscribed for ${this.username}`)
            resolve()
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('Realtime subscription error:', status, err)
            reject(new Error(`Realtime subscription failed: ${status}`))
          } else if (status === 'CLOSED') {
            console.warn('Realtime channel closed')
            this.isConnected = false
          }
        })
    })
  }

  // Handle remote operation from other clients
  async handleRemoteOperation(operationData) {
    if (operationData.client_id === this.clientId) {
      return // Ignore our own operations
    }

    const operation = new Operation(
      operationData.operation_type,
      operationData.position,
      operationData.content || '',
      operationData.length || 0,
      operationData.client_id,
      operationData.version
    )

    // Transform against pending operations
    const transformedOp = this.transformAgainstPending(operation)
    if (transformedOp) {
      this.applyOperation(transformedOp)
      this.version = Math.max(this.version, operationData.version)
    }
  }

  // Transform operation against pending operations
  transformAgainstPending(operation) {
    let transformedOp = operation
    for (const pendingOp of this.pendingOperations) {
      transformedOp = OperationalTransforms.transform(transformedOp, pendingOp)
      if (!transformedOp) break
    }
    return transformedOp
  }

  // Apply operation to document content
  applyOperation(operation) {
    const newContent = OperationalTransforms.apply(this.content, operation)
    this.content = newContent
    if (this.onContentChange) {
      this.onContentChange(newContent)
    }
  }

  // Send operation to server with retry logic
  async sendOperation(operation) {
    this.pendingOperations.push(operation)

    const maxRetries = 3
    let retries = 0

    while (retries < maxRetries) {
      try {
        
        const { error } = await supabase
          .from('document_operations')
          .insert({
            username: this.username,
            operation_type: operation.type,
            position: operation.position,
            content: operation.content || null,
            length: operation.length || null,
            version: operation.version,
            client_id: operation.clientId
          })

        if (error) {
          throw error
        }

        // Update document version and content in database
        const { error: updateError } = await supabase
          .from('collaborative_documents')
          .update({
            content: this.content,
            version: this.version + 1,
            updated_at: new Date()
          })
          .eq('username', this.username)

        if (updateError) {
          console.warn('Error updating document version:', updateError)
        }

        this.version += 1
        this.pendingOperations = this.pendingOperations.filter(op => op !== operation)
        return true

      } catch (error) {
        retries++
        console.error(`Error sending operation (attempt ${retries}):`, error)
        
        if (retries >= maxRetries) {
          console.error('Max retries reached, operation failed')
          this.pendingOperations = this.pendingOperations.filter(op => op !== operation)
          return false
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * retries))
      }
    }
    
    return false
  }

  // Handle local text change
  async handleLocalChange(newText, cursorPosition) {
    if (newText === this.content) {
      // Just cursor movement
      this.updateCursorPosition(cursorPosition)
      return
    }

    const operations = OperationalTransforms.generateOperations(
      this.content,
      newText,
      this.clientId,
      this.version
    )

    // Apply operations locally first (optimistic update)
    for (const operation of operations) {
      this.applyOperation(operation)
      await this.sendOperation(operation)
    }

    this.updateCursorPosition(cursorPosition)
  }

  // Update cursor position
  async updateCursorPosition(position) {
    this.lastCursorPosition = position
    
    try {
      const { error } = await supabase
        .from('active_editors')
        .upsert({
          username: this.username,
          client_id: this.clientId,
          cursor_position: position,
          last_seen: new Date()
        })

      if (error) {
        console.warn('Error updating cursor position:', error)
      }
    } catch (error) {
      console.warn('Error updating cursor position:', error)
    }
  }

  // Join as active editor
  async joinAsActiveEditor() {
    try {
      const { error } = await supabase
        .from('active_editors')
        .upsert({
          username: this.username,
          client_id: this.clientId,
          cursor_position: 0,
          last_seen: new Date()
        })

      if (error) {
        console.warn('Error joining as active editor:', error)
      }

      await this.loadActiveEditors()
    } catch (error) {
      console.warn('Error joining as active editor:', error)
    }
  }

  // Load active editors
  async loadActiveEditors() {
    const { data, error } = await supabase
      .from('active_editors')
      .select('client_id, cursor_position, last_seen')
      .eq('username', this.username)
      .gte('last_seen', new Date(Date.now() - 30000)) // Active in last 30 seconds

    if (error) {
      console.error('Error loading active editors:', error)
      return
    }

    const activeEditors = data.filter(editor => editor.client_id !== this.clientId)
    if (this.onActiveEditorsChange) {
      this.onActiveEditorsChange(activeEditors)
    }
  }

  // Leave as active editor
  async leaveAsActiveEditor() {
    try {
      await supabase
        .from('active_editors')
        .delete()
        .eq('username', this.username)
        .eq('client_id', this.clientId)
    } catch (error) {
      // Gracefully handle errors (e.g., in test environments)
      console.warn('Failed to leave as active editor:', error.message)
    }
  }

  // Check connection health and reconnect if needed
  async checkConnectionHealth() {
    if (!this.isConnected) {
      console.log('Attempting to reconnect realtime channel...')
      try {
        await this.setupRealtimeSync()
        this.isConnected = true
        console.log('Reconnected successfully')
      } catch (error) {
        console.warn('Reconnection failed:', error.message)
      }
    }
  }

  // Cleanup
  async disconnect() {
    this.isConnected = false
    await this.leaveAsActiveEditor()
    if (this.channel) {
      supabase.removeChannel(this.channel)
      this.channel = null
    }
  }

  // Get current content
  getContent() {
    return this.content
  }

  // Get current version
  getVersion() {
    return this.version
  }

  // Set content change callback
  setOnContentChange(callback) {
    this.onContentChange = callback
  }

  // Set active editors change callback
  setOnActiveEditorsChange(callback) {
    this.onActiveEditorsChange = callback
  }
}