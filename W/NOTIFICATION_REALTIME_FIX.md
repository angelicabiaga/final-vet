# Notification Realtime Fix

This version fixes:

`cannot add postgres_changes callbacks ... after subscribe()`

The notification service now creates a unique Supabase Realtime channel for every React effect mount, registers `.on("postgres_changes", ...)` before `.subscribe()`, and performs an idempotent cleanup. This is safe with React Strict Mode.

No additional SQL is needed for this JavaScript error.

Restart every localhost instance after replacing the project:

```cmd
Ctrl + C
npm start
```
