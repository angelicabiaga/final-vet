# PawCruz OTP + Resend setup

The web authentication flow now uses OTP for:
- Register
- Login
- Forgot Password
- Change Password
- Change Email
- OTP verification
- Resend OTP

## Deploy Resend sender

From the project root:

```bash
npx supabase login
npx supabase link --project-ref ucozpjeeawbycefxkasn
npx supabase secrets set --env-file supabase/resend.env
npx supabase functions deploy send-otp-email
```

`supabase/resend.env` contains the Resend API key supplied for this capstone and is ignored by Git.

The default sender is `PawCruz <onboarding@resend.dev>`. Resend may restrict this test sender to the email address associated with your Resend account. For sending OTPs to any user, verify a domain in Resend and replace `RESEND_FROM_EMAIL` in `supabase/resend.env`, then run the secrets command again.

## Run website

```bash
npm install
npm start
```

No new authentication database tables are required. The project continues using the existing `profiles` table.
