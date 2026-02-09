# Lekh

A minimal writing website where users can write and save content. Simple, clean, no fancy UI - just pure writing.

## Live Demo

[Visit Lekh](https://lekh.space/)

## Features

- Simple text editor with auto-save (1-second debounce)
- Content persisted to Supabase
- Shared writing space using "main" document
- Minimal UI focused on writing

## Tech Stack

- **Frontend**: Next.js + React
- **Database**: Supabase
- **Hosting**: Vercel
- **Philosophy**: Keep it simple

## Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up Supabase:
   - Create a Supabase project
   - Run the commands in `database.sql` in your Supabase SQL Editor

4. Add environment variables in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```

   `SUPABASE_SERVICE_ROLE_KEY` is used by server routes (`/api/create-user`, `/api/private-append`) to perform protected writes.

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

## Testing

The project includes comprehensive test coverage:

```bash
npm test              # Run tests once
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

**Test Stats:**
- ✅ 53 tests across 5 test suites
- 🎯 88.34% overall code coverage
- 🧪 Full component and integration testing
- 🔄 Automated testing via GitHub Actions

## CI/CD

Automated workflows run on every push and pull request:
- **Test Suite**: Multi-version Node.js testing
- **Security Audit**: Dependency vulnerability scanning
- **Build Verification**: Next.js build validation
- **Coverage Reporting**: Automated coverage tracking

![Tests](https://github.com/username/lekh/workflows/Test%20Suite/badge.svg)
![CI](https://github.com/username/lekh/workflows/Continuous%20Integration/badge.svg)

## Contributing

Keep the philosophy of simplicity:
- No complex features
- Minimal error handling
- Focus on core writing functionality
- Light, smart implementation
- All changes must pass tests

## Deployment

Deploy to Vercel with:
```bash
npx vercel
```

Add the Supabase environment variables in your Vercel project settings.
