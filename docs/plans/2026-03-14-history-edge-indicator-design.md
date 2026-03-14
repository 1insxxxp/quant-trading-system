# History Edge Indicator Design

**Goal**

Replace the floating historical-loading chip with a compact left-edge indicator that feels native to a professional trading terminal.

**Design Direction**

- Keep the indicator attached to the left inner edge of the chart body
- Make the loading state feel like a live signal rail instead of a centered widget
- Keep the error state compact by collapsing it into a tiny edge-side retry affordance
- Avoid covering chart HUD or top controls

**States**

1. Loading
   - A thin vertical rail sits on the left edge
   - Inner bars pulse upward with cyan/teal energy
   - Subtle glow, no text block

2. Error
   - The rail shifts toward red/orange
   - A tiny retry chip appears next to the rail
   - The full backend error text is not rendered inline in the chart body

3. Idle
   - Fully hidden

**Files**

- `frontend/src/components/KlineChart.tsx`
- `frontend/src/components/KlineChart.test.tsx`
- `frontend/src/index.css`

**Verification**

- Component markup test for loading state
- Component markup test for error state
- Frontend focused tests and build
