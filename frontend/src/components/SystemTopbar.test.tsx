import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../stores/uiStore';
import { SystemTopbar } from './SystemTopbar';

describe('SystemTopbar', () => {
  beforeEach(() => {
    useUiStore.setState({
      isSidebarCollapsed: false,
      setSidebarCollapsed: () => undefined,
      toggleSidebar: () => undefined,
    });
  });

  it('renders only the sidebar toggle and title without the old topbar summary chips', () => {
    const markup = renderToStaticMarkup(<SystemTopbar />);

    expect(markup).toContain('后台工作台');
    expect(markup).toContain('收起侧边栏');
    expect(markup).not.toContain('市场');
    expect(markup).not.toContain('标的');
    expect(markup).not.toContain('周期');
    expect(markup).not.toContain('连接');
  });
});
