# Market Theme Shell Refactor Design

## Goal

Rebuild the current market shell into a cleaner backend-style workspace that keeps the existing行情功能不变，但收掉冗余品牌装饰、压缩顶部状态区，并统一成两套更明确的科技主题：

- dark theme: deep navy/black base with cyan-teal highlights
- light theme: white/cool-blue base with crisp technical borders

## Why Change

The current shell still has three UX problems:

1. The sidebar spends too much height on a decorative brand card that does not help the user trade or monitor the market.
2. The top-right status group is visually too tall and heavy for a persistent header.
3. The chart workspace feels vertically overfilled, so the page reads more like stacked frosted cards than a focused market terminal.

These problems are amplified by the current mixed visual language:

- oversized glass panels
- duplicated branding
- inconsistent Chinese copy quality
- a topbar status block that reads as a hero section instead of a utility strip

## Guideline Gaps

The current UI conflicts with the current Web Interface Guidelines in three practical ways:

- decorative chrome competes with the primary task instead of supporting it
- persistent navigation and status controls occupy more vertical space than necessary
- the information hierarchy does not make the chart workspace feel like the primary action surface

The redesign will correct those gaps by reducing ornamental weight, tightening persistent chrome, and clarifying the chart as the dominant work area.

## Layout Changes

### Sidebar

The sidebar becomes a pure text navigation rail.

- Remove the large brand card entirely.
- Keep only a compact textual header area for context.
- Preserve the existing menu structure and active/planned states.
- Use pure text items with status labels instead of decorative logos or tag pills.

### Topbar

The topbar stays fixed but becomes much slimmer.

- Left side keeps:
  - sidebar collapse toggle
  - live price
  - current `symbol + exchange`
- Right side becomes a compact utility strip:
  - small theme toggle
  - slim clock capsule
  - minimal online status signal

The right side should visually read like an instrument cluster, not a secondary card stack.

### Main Workspace

The page remains a single-market workspace.

- Keep the market filter row.
- Keep the chart toolbar and indicator controls.
- Reduce the effective chart area height so the canvas breathes more inside the workspace card.
- Preserve the inspector and indicator controls, but thin the surrounding shell.

## Visual Direction

### Dark Theme

- Base: deep blue-black, layered with subtle teal gradients
- Accent: cyan-teal glow for active controls, lines, and focus states
- Surface: restrained glass and dark panels with fine borders

### Light Theme

- Base: cool white and pale blue surfaces
- Accent: bright technical blue with restrained cyan support
- Surface: crisp borders, light gradient panels, less foggy glass

### Shared Language

- Fewer oversized frosted blocks
- More precise borders and subtle edge light
- Thin controls and tighter radii
- Small, meaningful motion only
- Clean Chinese copy throughout

## Component Strategy

### `AdminSidebar`

- Remove `BrandLogo` usage from the large upper card
- Rebuild the shell as a compact text-first sidebar
- Keep active/planned nav items but reduce padding and vertical cost

### `SystemTopbar`

- Slim the header height
- Reduce right-side meta cluster to a single compact strip
- Keep live market readout readable without turning it into a hero banner

### `KlineChart`

- Tighten the toolbar shell above the chart
- Reduce extra vertical framing around the canvas
- Keep chart inspector and indicator controls, but integrate them into a thinner workspace header

### `index.css`

- Rework global design tokens for both themes
- Replace current heavy shell styles with thinner, more technical primitives
- Rebalance spacing so the chart workspace dominates without appearing bloated

## Non-Goals

- No backend changes
- No websocket or data-flow changes
- No routing or module behavior changes
- No new product modules beyond the existing market center

## Files To Touch

- `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\App.tsx`
- `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\AdminSidebar.tsx`
- `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\AdminSidebar.test.tsx`
- `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\SystemTopbar.tsx`
- `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\SystemTopbar.test.tsx`
- `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\KlineChart.tsx`
- `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\KlineChart.test.tsx`
- `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\index.css`

## Validation

- The sidebar no longer contains the large decorative brand block.
- The sidebar renders as a pure text navigation rail.
- The top-right utility area is visibly slimmer and closer to the provided compact reference.
- The chart workspace feels shorter and more deliberate instead of vertically overfilled.
- Dark theme reads as cyan-teal on deep navy/black.
- Light theme reads as white/cool-blue technical UI.
- Chinese copy is corrected in the modified shell components.
- Frontend tests pass.
- Frontend build passes.
