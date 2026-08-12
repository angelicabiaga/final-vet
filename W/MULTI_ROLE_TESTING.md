# Testing multiple roles at the same time

Each localhost port has separate browser localStorage, so each port can stay logged in as a different role.

Open four Command Prompt or VS Code terminal windows in the project folder.

```cmd
npm run start:admin
```
Opens `http://localhost:3000`.

```cmd
npm run start:staff
```
Opens `http://localhost:3001`.

```cmd
npm run start:vet
```
Opens `http://localhost:3002`.

```cmd
npm run start:owner
```
Opens `http://localhost:3003`.

Use a different account on each port. All ports still connect to the same Supabase project, so appointment, pet, and schedule changes are shared.
