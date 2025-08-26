import { Operation, OperationalTransforms } from '../../lib/operationalTransforms'

describe('OperationalTransforms', () => {
  describe('Operation class', () => {
    test('creates insert operation', () => {
      const op = Operation.insert(5, 'hello', 'client1', 1)
      expect(op.type).toBe('insert')
      expect(op.position).toBe(5)
      expect(op.content).toBe('hello')
      expect(op.length).toBe(5)
      expect(op.clientId).toBe('client1')
      expect(op.version).toBe(1)
    })

    test('creates delete operation', () => {
      const op = Operation.delete(3, 7, 'client2', 2)
      expect(op.type).toBe('delete')
      expect(op.position).toBe(3)
      expect(op.content).toBe('')
      expect(op.length).toBe(7)
      expect(op.clientId).toBe('client2')
      expect(op.version).toBe(2)
    })
  })

  describe('transform operations', () => {
    test('transforms insert after insert', () => {
      const opA = Operation.insert(10, 'world', 'client1', 1)
      const opB = Operation.insert(5, 'hello ', 'client2', 1)
      
      const transformed = OperationalTransforms.transform(opA, opB)
      
      expect(transformed.position).toBe(16) // 10 + 6 ('hello '.length)
      expect(transformed.content).toBe('world')
    })

    test('transforms insert before insert - no change', () => {
      const opA = Operation.insert(3, 'abc', 'client1', 1)
      const opB = Operation.insert(10, 'xyz', 'client2', 1)
      
      const transformed = OperationalTransforms.transform(opA, opB)
      
      expect(transformed.position).toBe(3) // No change
      expect(transformed.content).toBe('abc')
    })

    test('transforms insert after delete', () => {
      const opA = Operation.insert(10, 'new', 'client1', 1)
      const opB = Operation.delete(3, 5, 'client2', 1)
      
      const transformed = OperationalTransforms.transform(opA, opB)
      
      expect(transformed.position).toBe(5) // 10 - 5 (deleted length)
      expect(transformed.content).toBe('new')
    })

    test('transforms delete after insert', () => {
      const opA = Operation.delete(8, 4, 'client1', 1)
      const opB = Operation.insert(5, 'hello', 'client2', 1)
      
      const transformed = OperationalTransforms.transform(opA, opB)
      
      expect(transformed.position).toBe(13) // 8 + 5 ('hello'.length)
      expect(transformed.length).toBe(4)
    })

    test('transforms delete within insert range', () => {
      const opA = Operation.delete(7, 3, 'client1', 1)
      const opB = Operation.insert(5, 'hello', 'client2', 1)
      
      const transformed = OperationalTransforms.transform(opA, opB)
      
      expect(transformed.position).toBe(12) // 7 + 5
      expect(transformed.length).toBe(3)
    })

    test('transforms overlapping deletes', () => {
      const opA = Operation.delete(5, 10, 'client1', 1) // Delete 5-15
      const opB = Operation.delete(3, 8, 'client2', 1) // Delete 3-11, overlaps 5-11
      
      const transformed = OperationalTransforms.transform(opA, opB)
      
      expect(transformed.position).toBe(3) // Adjusted to start of B
      expect(transformed.length).toBe(4) // Original 10 - overlap of 6 = 4
    })

    test('returns null for completely contained delete', () => {
      const opA = Operation.delete(5, 5, 'client1', 1) // Delete 5-10
      const opB = Operation.delete(3, 10, 'client2', 1) // Delete 3-13 (contains A)
      
      const transformed = OperationalTransforms.transform(opA, opB)
      
      expect(transformed).toBeNull() // A is no longer valid
    })

    test('ignores operations from same client', () => {
      const opA = Operation.insert(5, 'test', 'client1', 1)
      const opB = Operation.insert(3, 'hello', 'client1', 1)
      
      const transformed = OperationalTransforms.transform(opA, opB)
      
      expect(transformed).toEqual(opA) // No transformation
    })
  })

  describe('apply operations', () => {
    test('applies insert operation', () => {
      const text = 'Hello world'
      const operation = Operation.insert(6, 'beautiful ', 'client1', 1)
      
      const result = OperationalTransforms.apply(text, operation)
      
      expect(result).toBe('Hello beautiful world')
    })

    test('applies delete operation', () => {
      const text = 'Hello beautiful world'
      const operation = Operation.delete(6, 10, 'client1', 1) // Delete 'beautiful '
      
      const result = OperationalTransforms.apply(text, operation)
      
      expect(result).toBe('Hello world')
    })

    test('applies insert at beginning', () => {
      const text = 'world'
      const operation = Operation.insert(0, 'Hello ', 'client1', 1)
      
      const result = OperationalTransforms.apply(text, operation)
      
      expect(result).toBe('Hello world')
    })

    test('applies insert at end', () => {
      const text = 'Hello'
      const operation = Operation.insert(5, ' world', 'client1', 1)
      
      const result = OperationalTransforms.apply(text, operation)
      
      expect(result).toBe('Hello world')
    })

    test('applies delete at beginning', () => {
      const text = 'Hello world'
      const operation = Operation.delete(0, 6, 'client1', 1) // Delete 'Hello '
      
      const result = OperationalTransforms.apply(text, operation)
      
      expect(result).toBe('world')
    })

    test('applies delete at end', () => {
      const text = 'Hello world'
      const operation = Operation.delete(5, 6, 'client1', 1) // Delete ' world'
      
      const result = OperationalTransforms.apply(text, operation)
      
      expect(result).toBe('Hello')
    })
  })

  describe('transform multiple operations', () => {
    test('transforms list of operations against single operation', () => {
      const operations = [
        Operation.insert(10, 'A', 'client1', 1),
        Operation.insert(15, 'B', 'client1', 1),
        Operation.delete(5, 2, 'client1', 1)
      ]
      const againstOp = Operation.insert(3, 'XYZ', 'client2', 1)
      
      const transformed = OperationalTransforms.transformOperations(operations, againstOp)
      
      expect(transformed).toHaveLength(3)
      expect(transformed[0].position).toBe(13) // 10 + 3
      expect(transformed[1].position).toBe(18) // 15 + 3
      expect(transformed[2].position).toBe(8)  // 5 + 3
    })

    test('filters out null operations', () => {
      const operations = [
        Operation.delete(5, 5, 'client1', 1), // Will be made null
        Operation.insert(15, 'test', 'client1', 1)
      ]
      const againstOp = Operation.delete(3, 10, 'client2', 1) // Contains first delete
      
      const transformed = OperationalTransforms.transformOperations(operations, againstOp)
      
      expect(transformed).toHaveLength(1) // Only one valid operation remains
      expect(transformed[0].content).toBe('test')
    })
  })

  describe('generate operations from text diff', () => {
    test('generates insert operation for added text', () => {
      const oldText = 'Hello world'
      const newText = 'Hello beautiful world'
      
      const operations = OperationalTransforms.generateOperations(oldText, newText, 'client1', 1)
      
      // Verify the final result is correct by applying operations
      let result = oldText
      for (const op of operations) {
        result = OperationalTransforms.apply(result, op)
      }
      expect(result).toBe(newText)
      
      // Should generate operations that produce the correct result
      expect(operations.length).toBeGreaterThan(0)
    })

    test('generates delete operation for removed text', () => {
      const oldText = 'Hello beautiful world'
      const newText = 'Hello world'
      
      const operations = OperationalTransforms.generateOperations(oldText, newText, 'client1', 1)
      
      // Verify the final result is correct by applying operations
      let result = oldText
      for (const op of operations) {
        result = OperationalTransforms.apply(result, op)
      }
      expect(result).toBe(newText)
      
      // Should generate operations that produce the correct result
      expect(operations.length).toBeGreaterThan(0)
    })

    test('generates no operations for identical text', () => {
      const text = 'Hello world'
      
      const operations = OperationalTransforms.generateOperations(text, text, 'client1', 1)
      
      expect(operations).toHaveLength(0)
    })

    test('handles complex changes with multiple operations', () => {
      const oldText = 'The quick fox jumps'
      const newText = 'A quick brown fox leaps high'
      
      const operations = OperationalTransforms.generateOperations(oldText, newText, 'client1', 1)
      
      expect(operations.length).toBeGreaterThan(0)
      // Apply operations to verify correctness
      let result = oldText
      for (const op of operations) {
        result = OperationalTransforms.apply(result, op)
      }
      expect(result).toBe(newText)
    })
  })
})