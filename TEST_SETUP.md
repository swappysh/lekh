# Test Setup for Lekh

## Overview
A comprehensive test suite has been created for the Lekh writing application covering all major components and functionality.

## Test Structure

```
__tests__/
├── index.test.js                    # Home page component tests
├── [username].test.js               # User writing page tests  
├── components/
│   ├── Editor.test.js              # Editor component tests
│   └── ShortcutsModal.test.js      # Modal component tests
└── integration/
    └── supabase.test.js            # Database integration tests
```

## Test Coverage

### Home Page (`pages/index.js`)
- Renders form and UI elements
- Username validation and availability checking
- Random username generation
- Form submission with success/error handling
- Pattern validation for usernames

### User Writing Page (`pages/[username].js`)
- User existence verification
- Loading states
- Content editing and auto-save functionality
- Keyboard shortcuts (Shift+?, Ctrl+Alt+D, Escape)
- Date/time insertion
- Platform detection for shortcuts
- Document ID generation per session

### Editor Component (`components/Editor.js`)
- Content display and editing
- Auto-resize functionality
- Forwarded ref support
- Multiline content handling
- CSS class and attribute verification

### Shortcuts Modal (`components/ShortcutsModal.js`)
- Conditional rendering based on isOpen prop
- Shortcuts list display
- Click handling (overlay vs content)
- Escape instruction display
- Modal styling and positioning

### Supabase Integration (`lib/supabase.js`)
- Username availability checks
- User creation/upsert operations
- Document saving and updating
- Error handling for database operations
- Network error resilience
- Full user creation and document save workflows

## Running Tests

```bash
npm test                # Run all tests once
npm run test:watch      # Run tests in watch mode  
npm run test:coverage   # Run tests with coverage report
```

## Test Configuration

- **Framework**: Jest with React Testing Library
- **Environment**: jsdom for DOM simulation
- **Mocking**: Next.js router, Supabase client, crypto.randomUUID
- **Setup**: Automatic test environment configuration via `jest.setup.js`

## Mock Strategy

- **Supabase**: Mocked to return predictable responses for testing different scenarios
- **Next.js Router**: Mocked to avoid navigation during tests
- **crypto.randomUUID**: Mocked to return consistent UUIDs for testing
- **random-words**: Mocked to return predictable username generation

## Test Results
✅ All 53 tests passing
✅ 5/5 test suites passing
✅ Full coverage of core functionality

The test suite ensures reliability of:
- User registration flow
- Content creation and editing
- Auto-save functionality  
- Keyboard shortcuts
- Database operations
- Error handling
- UI component behavior