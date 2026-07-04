# Team Email Invite — Design Spec

**Date:** 2026-07-04
**Scope:** Allow a director to invite a new team member by email and assign their role at invite time.
**Phase:** Phase 1 addition (no schema changes required)

---

## Overview

A director enters an email address and role on the Team page. The app calls Clerk's Invitations API, which sends a branded signup email to the invitee. When the invitee clicks the link and completes signup, their role is already embedded in Clerk's `publicMetadata`. The existing JIT provisioning in `getSessionUser` creates their DB record with the correct role on first login — no additional code required at that layer.

---

## API

**Route:** `POST /api/team/invite`
**Auth:** Director only (`requireRole(["director"])`)

**Request body:**
```json
{ "email": "john@example.com", "role": "technician" }
```

**Validation (Zod):**
- `email` — valid email format, required
- `role` — one of the 6 `UserRole` values, required

**Clerk API call:**
```
POST https://api.clerk.com/v1/invitations
Authorization: Bearer CLERK_SECRET_KEY
Content-Type: application/json

{
  "email_address": "john@example.com",
  "public_metadata": { "role": "technician" },
  "redirect_url": "https://your-app.vercel.app/dashboard"
}
```

**Response codes:**

| Code | Condition |
|------|-----------|
| 201 | Invite sent successfully |
| 400 | Invalid email format or invalid role |
| 401 | Caller is not a director |
| 409 | Email already has a Clerk account OR already has a pending invite |
| 500 | Clerk API failure |

**Error messages (user-facing):**
- Already a user → `"This person already has an account — ask them to sign in"`
- Already invited → `"An invite has already been sent to this address"`
- Clerk failure → `"Could not send invite. Please try again."`

---

## UI

**Location:** `src/app/team/TeamClient.tsx` — new `InviteForm` component added to the existing file.

**Trigger:** "Invite member" button at the top of the Team page, visible only when `canEdit` is true (directors only).

**Form fields:**
- Email — `<input type="email">`, required
- Role — `<select>` with all 6 role options (same list as the edit row dropdown)
- "Send invite" submit button
- "Cancel" text button that collapses the form

**Behaviour:**
- Button click expands the inline form (no modal)
- On success: form collapses, green message shown — "Invite sent to {email}"
- On error: red inline message with the specific reason
- Loading state: button shows "Sending…" and is disabled during the fetch

**Default role:** `technician` (most common invite)

---

## Files Changed

| Action | Path |
|--------|------|
| Create | `src/app/api/team/invite/route.ts` |
| Modify | `src/app/team/TeamClient.tsx` — add `InviteForm` component |
| Create | `src/app/api/team/__tests__/invite.test.ts` |

---

## Tests

File: `src/app/api/team/__tests__/invite.test.ts`

| Test | Expected |
|------|----------|
| Valid email + role, director | Calls Clerk API, returns 201 |
| Invalid email format | Returns 400, no Clerk call |
| Caller is not a director | Returns 401 |
| Clerk returns "already a user" error | Returns 409 with correct message |
| Clerk returns "already invited" error | Returns 409 with correct message |

Mocking strategy: `vi.stubGlobal("fetch", ...)` to intercept the Clerk API call — no real HTTP, no new test infrastructure.

---

## Out of Scope

- Pending invite tracking (showing "invited, awaiting signup" rows on the Team page) — Phase 2 backlog
- Invite cancellation / resend — Phase 2 backlog
- Inviting multiple people at once — not needed yet
