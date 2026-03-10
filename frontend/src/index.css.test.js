import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

describe('chart workspace theme styles', () => {
  it('keeps the indicator settings trigger readable in light theme', () => {
    expect(css).toContain(":root[data-theme='light'] .indicator-settings__trigger");
  });

  it('allows the indicator settings panel to overflow beyond the toolbar shell', () => {
    const toolbarShellBlock = css.match(/\.chart-workspace__toolbar-shell\s*\{[^}]*\}/);

    expect(toolbarShellBlock?.[0]).toContain('overflow: visible;');
  });

  it('keeps chart inspector chips fixed-width and number values tabular', () => {
    const chipBlock = css.match(/\.chart-inspector__chip\s*\{[^}]*\}/);

    expect(chipBlock?.[0]).toContain('min-width:');
    expect(chipBlock?.[0]).toContain('justify-content: space-between;');
    expect(css).toContain('.chart-inspector__value');
    expect(css).toContain('font-variant-numeric: tabular-nums;');
  });

  it('uses structured grid styling for the topbar meta cluster', () => {
    const metaBlock = css.match(/\.system-topbar__meta\s*\{[^}]*\}/);

    expect(metaBlock?.[0]).toContain('display: grid;');
  });
});
