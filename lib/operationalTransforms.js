// Simple Operational Transforms for collaborative text editing
// Handles insert and delete operations with conflict resolution

export class Operation {
  constructor(type, position, content = '', length = 0, clientId = '', version = 0) {
    this.type = type // 'insert' or 'delete'
    this.position = position
    this.content = content // for insert operations
    this.length = length // for delete operations
    this.clientId = clientId
    this.version = version
    this.timestamp = Date.now()
  }

  static insert(position, content, clientId, version) {
    return new Operation('insert', position, content, content.length, clientId, version)
  }

  static delete(position, length, clientId, version) {
    return new Operation('delete', position, '', length, clientId, version)
  }
}

export class OperationalTransforms {
  // Transform operation A against operation B
  // Returns the transformed operation A'
  static transform(opA, opB) {
    if (opA.clientId === opB.clientId) {
      return opA // Same client, no transform needed
    }

    const transformed = { ...opA }

    if (opA.type === 'insert' && opB.type === 'insert') {
      // Both insertions
      if (opB.position <= opA.position) {
        transformed.position += opB.content.length
      }
    } else if (opA.type === 'insert' && opB.type === 'delete') {
      // A inserts, B deletes
      if (opB.position <= opA.position) {
        if (opB.position + opB.length <= opA.position) {
          // Delete is before insert
          transformed.position -= opB.length
        } else {
          // Delete overlaps with insert position
          transformed.position = opB.position
        }
      }
    } else if (opA.type === 'delete' && opB.type === 'insert') {
      // A deletes, B inserts
      if (opB.position <= opA.position) {
        transformed.position += opB.content.length
      } else if (opB.position < opA.position + opA.length) {
        // Insert is within delete range
        transformed.length += opB.content.length
      }
    } else if (opA.type === 'delete' && opB.type === 'delete') {
      // Both deletions
      if (opB.position <= opA.position) {
        if (opB.position + opB.length <= opA.position) {
          // B deletes before A
          transformed.position -= opB.length
        } else if (opB.position + opB.length < opA.position + opA.length) {
          // B partially overlaps A from left
          const overlap = opB.position + opB.length - opA.position
          transformed.position = opB.position
          transformed.length -= overlap
        } else {
          // B completely contains A
          return null // Operation A is no longer valid
        }
      } else if (opB.position < opA.position + opA.length) {
        if (opB.position + opB.length <= opA.position + opA.length) {
          // B is contained within A
          transformed.length -= opB.length
        } else {
          // B partially overlaps A from right
          transformed.length = opB.position - opA.position
        }
      }
    }

    return new Operation(
      transformed.type,
      transformed.position,
      transformed.content,
      transformed.length,
      opA.clientId,
      opA.version
    )
  }

  // Apply operation to text
  static apply(text, operation) {
    if (operation.type === 'insert') {
      return (
        text.slice(0, operation.position) +
        operation.content +
        text.slice(operation.position)
      )
    } else if (operation.type === 'delete') {
      return (
        text.slice(0, operation.position) +
        text.slice(operation.position + operation.length)
      )
    }
    return text
  }

  // Transform a list of operations against a single operation
  static transformOperations(operations, againstOp) {
    return operations
      .map(op => this.transform(op, againstOp))
      .filter(op => op !== null) // Remove invalid operations
  }

  // Generate operations from text diff
  static generateOperations(oldText, newText, clientId, version) {
    const operations = []
    let pos = 0
    
    // Simple diff algorithm for demonstration
    // In production, you might want to use a more sophisticated diff
    const oldLen = oldText.length
    const newLen = newText.length
    
    while (pos < Math.max(oldLen, newLen)) {
      if (pos >= oldLen) {
        // Insert remaining characters
        const toInsert = newText.slice(pos)
        if (toInsert.length > 0) {
          operations.push(Operation.insert(pos, toInsert, clientId, version))
        }
        break
      } else if (pos >= newLen) {
        // Delete remaining characters
        const toDelete = oldLen - pos
        operations.push(Operation.delete(pos, toDelete, clientId, version))
        break
      } else if (oldText[pos] !== newText[pos]) {
        // Find the extent of the change
        let deleteEnd = pos
        let insertEnd = pos
        
        // Find end of deletion
        while (deleteEnd < oldLen && oldText[deleteEnd] !== newText[pos]) {
          deleteEnd++
        }
        
        // Find end of insertion
        while (insertEnd < newLen && newText[insertEnd] !== oldText[pos]) {
          insertEnd++
        }
        
        // Create operations
        if (deleteEnd > pos) {
          operations.push(Operation.delete(pos, deleteEnd - pos, clientId, version))
        }
        if (insertEnd > pos) {
          operations.push(Operation.insert(pos, newText.slice(pos, insertEnd), clientId, version))
        }
        
        pos = Math.max(deleteEnd, insertEnd)
      } else {
        pos++
      }
    }
    
    return operations
  }
}