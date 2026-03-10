import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminSidebar } from './AdminSidebar';

describe('AdminSidebar', () => {
  it('renders a text-only navigation rail without the oversized brand card', () => {
    const markup = renderToStaticMarkup(<AdminSidebar />);

    expect(markup).toContain('量化后台');
    expect(markup).toContain('导航菜单');
    expect(markup).toContain('行情中心');
    expect(markup).toContain('交易执行');
    expect(markup).toContain('当前');
    expect(markup).toContain('筹备中');
    expect(markup).not.toContain('Quant Trade System logo');
    expect(markup).not.toContain('Market Workspace');
    expect(markup).not.toContain('Realtime');
    expect(markup).not.toContain('Dual Theme');
  });
});
