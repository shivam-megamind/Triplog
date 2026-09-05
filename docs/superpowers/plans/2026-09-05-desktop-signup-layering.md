# Desktop Signup Layering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the existing authentication dialog receives every desktop click while preserving authentication and landing-page behavior.

**Architecture:** Render the existing backdrop and dialog at the document body so they are not trapped inside the landing hero's isolated stacking layer. Keep the same React state and handlers, then add only explicit overlay/dialog layering, the requested heading color, and the 44px landing Sign in hit area.

**Tech Stack:** Next.js 16, React 19, CSS Modules, global CSS, Playwright.

**Spec:** `SCOPE.md`, plus the approved desktop signup UI request in this conversation.

## Global Constraints

- Do not change authentication, account creation, Convex, routes, upload, reconstruction, publishing, sharing, or deployment behavior.
- Do not add a dependency or redesign the dialog.
- Do not commit, push, or deploy.

---

### Task 1: Focused modal interaction regression

**Files:**
- Create: `scripts/test-desktop-auth-modal.mjs`

**Interfaces:**
- Consumes: `LandingAuthAction`, `.landing-auth-backdrop`, `.landing-auth-dialog`, `.auth-card`, and the landing `Sign in` button.
- Produces: A focused browser check for desktop click ownership, background blocking, account creation, heading contrast, and mobile hit-area size.

- [ ] Open the landing page at 1440×900 and open **Build my journey**.
- [ ] Assert the backdrop is attached above the landing page, the submit button owns its centre point, and a backdrop click does not reach the underlying landing control.
- [ ] Submit a fresh development account without a forced click and confirm navigation to `/book`.
- [ ] Assert both auth heading modes use the existing dark-green color.
- [ ] At 390×844, assert the landing **Sign in** box is at least 44×44px.

### Task 2: Minimal modal and style fix

**Files:**
- Modify: `components/landing-auth-action.tsx`
- Modify: `app/globals.css`
- Modify: `app/landing.module.css`

**Interfaces:**
- Consumes: Existing `open`, `activeMode`, `close`, and authentication callbacks.
- Produces: The unchanged dialog rendered through `createPortal(..., document.body)` with explicit pointer and stacking rules.

- [ ] Render the existing backdrop/dialog through a React portal only while open.
- [ ] Keep the backdrop above page content and the dialog above the backdrop; allow pointer events on the modal and prevent click-through to the page.
- [ ] Set only `.auth-card h2` color to `var(--forest)`.
- [ ] Give the landing `.signIn` control a minimum 44px width while retaining its text styling.

### Task 3: Documentation and validation

**Files:**
- Modify: `SCOPE.md`
- Modify: `PLAN.md`
- Modify: `TEACH.md`

**Interfaces:**
- Consumes: The validated modal behavior.
- Produces: A plain-language record of why the portal is required.

- [ ] Record the desktop modal layering rule and small accessibility polish.
- [ ] Run the focused browser test, `npm run lint`, `npm run typecheck`, and `npm run build`.
- [ ] Stop without committing, pushing, or deploying.
