import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createStorage(initialValue?: string) {
  let value = initialValue ?? null;

  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_: string, nextValue: string) => {
      value = nextValue;
    }),
    removeItem: vi.fn(() => {
      value = null;
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
    vi.stubGlobal('localStorage', createStorage('true'));

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
});
