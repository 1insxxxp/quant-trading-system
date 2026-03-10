import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createStorage(initialValues?: Record<string, string>) {
  const values = new Map(Object.entries(initialValues ?? {}));

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, nextValue: string) => {
      values.set(key, nextValue);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

describe('uiStore', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to an expanded sidebar when no preference is stored', async () => {
    vi.stubGlobal('localStorage', createStorage());

    const { useUiStore } = await import('./uiStore');

    expect(useUiStore.getState().isSidebarCollapsed).toBe(false);
  });

  it('falls back safely when localStorage exists without browser storage methods', async () => {
    vi.stubGlobal('localStorage', {});

    const { useUiStore } = await import('./uiStore');

    expect(useUiStore.getState().isSidebarCollapsed).toBe(false);
  });

  it('restores the collapsed sidebar preference from localStorage', async () => {
    vi.stubGlobal('localStorage', createStorage({
      'quant-admin-sidebar-collapsed': 'true',
    }));

    const { useUiStore } = await import('./uiStore');

    expect(useUiStore.getState().isSidebarCollapsed).toBe(true);
  });

  it('persists toggle changes to localStorage', async () => {
    const storage = createStorage();
    vi.stubGlobal('localStorage', storage);

    const { SIDEBAR_STORAGE_KEY, useUiStore } = await import('./uiStore');

    useUiStore.getState().toggleSidebar();

    expect(useUiStore.getState().isSidebarCollapsed).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(SIDEBAR_STORAGE_KEY, 'true');
  });

  it('defaults to dark theme when no preference is stored', async () => {
    vi.stubGlobal('localStorage', createStorage());

    const { useUiStore } = await import('./uiStore');

    expect(useUiStore.getState().theme).toBe('dark');
  });

  it('restores and toggles the theme preference from localStorage', async () => {
    const storage = createStorage({
      'quant-admin-theme': 'light',
    });
    vi.stubGlobal('localStorage', storage);

    const { THEME_STORAGE_KEY, useUiStore } = await import('./uiStore');

    expect(useUiStore.getState().theme).toBe('light');

    useUiStore.getState().toggleTheme();

    expect(useUiStore.getState().theme).toBe('dark');
    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'dark');
  });
});
