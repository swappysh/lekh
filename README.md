# Lekh

A minimal writing website where users can write and save content. Simple, clean, no fancy UI - just pure writing.

## Live Demo

[Visit Lekh](https://lekh-tau.vercel.app/)

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
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

## Contributing

Keep the philosophy of simplicity:
- No complex features
- Minimal error handling
- Focus on core writing functionality
- Light, smart implementation

## Deployment

Deploy to Vercel with:
```bash
npx vercel
```

Add the Supabase environment variables in your Vercel project settings.