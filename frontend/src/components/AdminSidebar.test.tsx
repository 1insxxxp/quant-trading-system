import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminSidebar } from './AdminSidebar';

describe('AdminSidebar', () => {
  it('renders the full Quant Trade System logo in the brand section', () => {
    const markup = renderToStaticMarkup(<AdminSidebar />);

    expect(markup).toContain('Quant Trade System logo');
    expect(markup).toContain('交易后台');
    expect(markup).toContain('行情中心');
  });
});
