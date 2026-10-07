# TBA Credentialing

TBA Credentialing is a multi-tenant credentialing and enrollment operations platform backed by Supabase.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase Auth + Postgres + RLS
- Supabase Edge Functions for privileged integrations such as NPPES

## Local setup

1. Clone the repository.
2. Copy `.env.example` to `.env.local`.
3. Add the Supabase publishable key from **Supabase → Settings → API Keys**.
4. Install dependencies.
5. Start the development server.

```powershell
git clone https://github.com/Blatif88/tba-credentialing.git
cd tba-credentialing
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000.

## Environment variables

```text
NEXT_PUBLIC_SUPABASE_URL=https://kjuxfjufoxlxhpoainnq.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Never place a Supabase secret/service-role key in a `NEXT_PUBLIC_` variable.

## Current frontend scope

The first frontend foundation includes:

- Password login
- Protected app shell
- Dashboard
- Today's Work
- Clients
- Organizations
- Providers
- Provider creation
- Provider detail
- Live NPPES verification
- NPPES field comparison review
- Enrollment case list

The database schema and Edge Functions are already deployed to the connected Supabase project.
