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
          transformed.length = opA.length - overlap
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

  // Generate operations from text diff using a simple approach
  static generateOperations(oldText, newText, clientId, version) {
    // For simplicity and reliability, use a basic approach:
    // If texts are different, delete all and insert new content
    if (oldText === newText) {
      return []
    }
    
    const operations = []
    
    // Find the longest common prefix
    let prefixLength = 0
    while (prefixLength < Math.min(oldText.length, newText.length) && 
           oldText[prefixLength] === newText[prefixLength]) {
      prefixLength++
    }
    
    // Find the longest common suffix
    let suffixLength = 0
    while (suffixLength < Math.min(oldText.length - prefixLength, newText.length - prefixLength) &&
           oldText[oldText.length - 1 - suffixLength] === newText[newText.length - 1 - suffixLength]) {
      suffixLength++
    }
    
    // Calculate what needs to be deleted and inserted
    const deleteStart = prefixLength
    const deleteLength = oldText.length - prefixLength - suffixLength
    const insertStart = prefixLength
    const insertContent = newText.slice(prefixLength, newText.length - suffixLength)
    
    // Generate operations
    if (deleteLength > 0) {
      operations.push(Operation.delete(deleteStart, deleteLength, clientId, version))
    }
    
    if (insertContent.length > 0) {
      operations.push(Operation.insert(insertStart, insertContent, clientId, version))
    }
    
    return operations
  }
}