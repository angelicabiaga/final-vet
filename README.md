# PawCruz Veterinary Management System

PawCruz is a React and Supabase clinic-management application with role-based
workflows for administrators, staff, veterinarians, and pet owners. Production
authentication uses Supabase Auth; authorization is enforced by PostgreSQL Row
Level Security, not only by React route guards.

## Local React setup

1. Copy `.env.example` to `.env`.
2. Add the browser-safe Supabase project URL and anon/publishable key.
3. Install and start the app:

```bash
npm install
npm start
```

Never place `GROQ_API_KEY`, a Supabase secret key, or the legacy service-role
key in a React environment variable.

## Production Auth and AI deployment

Follow [AI_CHATBOT_SETUP.md](./AI_CHATBOT_SETUP.md) in order. It covers:

- backing up and migrating existing profiles without changing their IDs;
- inviting existing users into Supabase Auth and removing plaintext passwords;
- applying owner/role-specific RLS and private-storage policies;
- configuring and deploying the authenticated Groq chatbot Edge Function;
- deploying the protected admin invitation function;
- staging, security, quota, and veterinary-safety checks.

The final production migration is:
`supabase/production_auth_rls_chat_quota.sql`.

## Legacy SQL warning

Several older setup/repair SQL files remain as project history and contain
school-demo anonymous policies. Do not run `custom_auth_patch.sql` or a legacy
module/repair script after the production migration. For a fresh environment,
install the required baseline modules first, then apply the production migration
last so it removes permissive grants and policies.

## Build

```bash
npm run build
```
