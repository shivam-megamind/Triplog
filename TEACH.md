# How this project works

Milestone 1 is still being built. This document will be completed after its checks pass.

## Public landing page

- `/` is the public introduction to Triplog. It explains the photo-to-book journey in four moments and stores no personal information.
- Both “Turn a trip into a book” links open `/book`, where the existing sign-in and private trip-building flow continues.
- `app/page.tsx` holds the landing-page content and its four sections. `app/landing.module.css` holds the page-specific visual design, mobile layout, focus style, and reduced-motion behaviour.
- `public/images` holds the travel photographs used in the page previews. They are display material only and are not connected to Convex.
- Convex is not involved until someone reaches `/book`. The landing page is a static page, meaning Next.js prepares it in advance so it can open quickly.
- If the landing page disappeared, saved trips would remain safe in Convex and the private builder would still exist at `/book`. If `/book` disappeared, the landing page would still appear but its two actions would have nowhere useful to go.
- Validation covered the automated tests, lint, type checking, production build, the two action links, image loading, keyboard focus, reduced motion, mobile and desktop widths, horizontal overflow, and browser errors.
