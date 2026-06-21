# Launch Checklist

## Pre-launch: Environment

- [ ] `DATABASE_URL` set in Vercel project settings (Neon production pooled URL)
- [ ] `DIRECT_URL` set in Vercel project settings (Neon production direct URL)
- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — production key
- [ ] `CLERK_SECRET_KEY` — production key
- [ ] `CLERK_WEBHOOK_SECRET` — production webhook secret
- [ ] `BLOB_READ_WRITE_TOKEN` — Vercel Blob token
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — VAPID public key
- [ ] `VAPID_PRIVATE_KEY` — VAPID private key
- [ ] `VAPID_CONTACT_EMAIL` — contact email for VAPID

## Pre-launch: Clerk

- [ ] Clerk webhook endpoint pointing to production URL (`/api/webhooks/clerk`)
- [ ] All staff accounts created in Clerk with correct `public_metadata.role`
- [ ] Verified each user can sign in and the DB user row has the correct role

## Pre-launch: Build

- [ ] `pnpm build` passes locally with zero errors
- [ ] `pnpm test` — all 20 unit tests passing
- [ ] `pnpm lint` — zero lint errors
- [ ] `pnpm tsc --noEmit` — zero TypeScript errors

## Pre-launch: Data

- [ ] Production jobs entered (from Simpro schedule / current job list)
- [ ] Technicians assigned to their current jobs in the Schedule page
- [ ] Health endpoint responding: `curl https://your-app.vercel.app/api/health`

## Field Trial (3 days before full go-live)

- [ ] 1–2 technicians using app in real conditions
- [ ] Clock-in/out tested on real devices
- [ ] Variation submitted, director received push notification within 60 seconds
- [ ] Director approved/rejected from phone
- [ ] Invoice record created in DB for approved variation
- [ ] Any UX issues noted and fixed

## Go-Live

- [ ] All staff accounts active and tested
- [ ] PWA installed on all technician phones
- [ ] Push notifications working on all devices
- [ ] 30-minute training session run (use `docs/training/` guides)
- [ ] UptimeRobot monitoring `/api/health` every 5 minutes
- [ ] `/dev/login` page only accessible in dev (returns 404 in production — already coded)

## Post-launch (week 1)

- [ ] Monitor Vercel function logs for errors
- [ ] Check crew board is showing live data for service managers
- [ ] Confirm variations are being approved and invoice records updated
- [ ] Gather feedback from technicians on clock-in/out friction
