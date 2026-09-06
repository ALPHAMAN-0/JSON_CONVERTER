---
tags: [claude, JSON_CONVERTER]
---

## Commands (from package.json scripts)
- Dev server: `npm run dev` (runs `vite`)
- Build: `npm run build` (runs `tsc --noEmit && vite build`)
- Preview built app: `npm run preview` (runs `vite preview`)
- Tests: `npm test` (runs `vitest run`)
- Typecheck only: `npm run typecheck` (runs `tsc --noEmit`)

No lint script is defined in package.json.

## Files worth reading first
- `package.json` — scripts and dependencies
- `src/App.tsx` — root component, state shape, and how the conversion pipeline is wired
- `README.md` — feature set and the exact output JSON shape

Architecture: see ARCHITECTURE.md — read before structural changes
