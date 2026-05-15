# Espresso Amber Redesign Spec

Date: 2026-05-15
Project: Dream Music Map
Scope: UI theming + layout refinements + entry gating for map/shelf

## Goals
- Switch to a dark, vintage "Espresso Amber" palette with high readability.
- Keep search clearly visible and discoverable.
- Maintain separated entry for Map/Shelf to reduce initial resource load.
- Preserve performance by minimizing heavy work before user chooses a view.

## Non-Goals
- No data model changes.
- No new backend endpoints.
- No feature additions beyond UI/UX and entry gating.

## Visual Direction
- Mood: dark, warm, vinyl studio.
- Texture: subtle grain, soft bloom, low-contrast glass.
- Typography: existing pairing stays (Poppins + Righteous).

## Color System
Primary surface colors:
- Ink background: #120f0c
- Espresso panel: #1b1511
- Roast panel: #241b15
- Elevated: #2b2018

Text:
- Primary: #f3e8d9
- Secondary: #c4b39a
- Tertiary: #8d7c66

Accents:
- Amber: #d39b5f
- Brass: #b77b3f
- Ember: #cc6b4a

Borders and glow:
- Soft edge: rgba(246, 229, 207, 0.08)
- Bronze edge: rgba(194, 150, 97, 0.25)
- Glow amber: rgba(211, 155, 95, 0.18)
- Glow ember: rgba(204, 107, 74, 0.18)

## Component Rules
### Navigation
- Floating capsule retained.
- Background: espresso with blur.
- Border: soft edge.
- Active controls: amber/brass emphasis.

### Search
- Must be visually dominant under the navbar.
- Input fields use roast background with bronze edge.
- Focus ring uses amber glow for clarity.
- Search button uses amber/brass gradient.

### Cards
- Use espresso/roast/elevated layering for hierarchy.
- Shadows stay subtle; no scale hover.

### Map
- Keep map legible on dark surfaces.
- Map outline and country strokes use bronze edges at 35-45% opacity.
- Background uses espresso ink with soft texture/grid.

## Layout & Entry Gating
- Keep Map/Shelf split entry to reduce initial load.
- Add a new intro page (entry gate) with two CTAs:
  - Enter Map View
  - Enter Shelf View
- Only render heavy map/shelf after entry is chosen.

## Performance Guidelines
- No new heavy assets in the entry gate.
- Avoid additional large animations.
- Ensure search results render only after user interaction.

## Accessibility
- Maintain text contrast >= 4.5:1 for body text.
- Visible focus states in amber glow.
- Tap targets >= 44px.

## Files to Update (Planned)
- src/app/globals.css (color variables, focus, backgrounds)
- src/app/layout.tsx (selection/focus adjustments if needed)
- src/components/ui/app-navbar.tsx
- src/components/ui/search-overlay.tsx
- src/components/ui/memoized-geographies.tsx
- src/app/page.tsx (entry gate if not already finalized)

## Open Questions
- None.

## Success Criteria
- User sees search immediately on the map screen.
- Entry gate prevents heavy render before choice.
- Visual tone matches Espresso Amber mockup.
