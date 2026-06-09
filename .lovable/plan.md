## Problem

On the admin dashboard (`/admin`), mobile Chrome on Android shows black flashes / static / noise while scrolling. This is a GPU compositing-layer bug triggered by:

- Every card on `AdminDashboard.tsx` uses `hover:-translate-y-0.5` + `transition-[box-shadow,transform]`. On touch, Chrome treats taps as a sticky `:hover`, which promotes a lot of cards to their own compositing layers at the same time the page is scrolling.
- The mobile sidebar in `DashboardLayout.tsx` is `fixed inset-y-0 left-0 z-50 ... -translate-x-full` even when closed, leaving a permanent off-screen composited layer that interacts badly with the scrolling main area.
- The white "welcome banner" + 6 gradient stat cards + 3 gradient fee cards stacked vertically on mobile create many overlapping painted gradients, amplifying the artifacting on scroll.

The fix already attempted in `src/index.css` (lines ~120-145) only resets `will-change` but doesn't stop the hover-transform from re-promoting layers on tap.

## Fix

### 1. `src/pages/admin/AdminDashboard.tsx`
For all three card groups (primary stats, fee cards, quick links):
- Drop `hover:-translate-y-0.5` and `transition-[box-shadow,transform]` on mobile.
- Keep the lift effect on desktop only by prefixing with `lg:` (e.g. `lg:hover:-translate-y-0.5 lg:transition-[box-shadow,transform]`).
- Keep `hover:shadow-md` only on `lg:` too — shadow changes alone do not glitch but pairing helps consistency.

### 2. `src/components/DashboardLayout.tsx`
- Render the mobile sidebar conditionally instead of leaving a permanent fixed off-screen layer. Keep the desktop sidebar (lg+) always mounted, but on `< lg` only mount it (and its overlay) when `sidebarOpen` is true. This removes the idle composited layer entirely on mobile so scrolling the main content paints cleanly.
- Keep the slide animation by mounting the mobile sidebar with the closed `-translate-x-full` class first, then flipping to `translate-x-0` on next frame (small `useEffect` toggle), so it still slides in.

### 3. `src/index.css`
- Add a `@media (hover: none)` block that force-disables `:hover` transforms on cards/links project-wide, as a safety net for other dashboards (instructor, parent, student) that copy the same pattern:
  ```css
  @media (hover: none) {
    a:hover, button:hover, .group:hover { transform: none !important; }
  }
  ```
- Keep the existing mobile `will-change: auto` rule.

## Verification

- Open `/admin` on mobile Chrome viewport (380px) and scroll the stat grid + fee summary repeatedly — no black flashes.
- Open and close the sidebar — slide animation still works, overlay still dims.
- Desktop view (`lg:`) keeps the hover lift on cards.
- No layout shift on any breakpoint.

## Scope

Touches only `src/pages/admin/AdminDashboard.tsx`, `src/components/DashboardLayout.tsx`, and `src/index.css`. No data, auth, or routing changes.