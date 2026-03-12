import { create } from 'zustand';

export const SIDEBAR_STORAGE_KEY = 'quant-admin-sidebar-collapsed';
export const THEME_STORAGE_KEY = 'quant-admin-theme';
export const CROSSHAIR_MAGNET_STORAGE_KEY = 'quant-crosshair-magnet';

type UiStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type ThemeMode = 'dark' | 'light';

interface UiState {
  isSidebarCollapsed: boolean;
  theme: ThemeMode;
  isCrosshairMagnetEnabled: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  toggleCrosshairMagnet: () => void;
}

function resolveUiStorage(): UiStorage | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const storage = localStorage as Partial<UiStorage>;

  if (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return null;
  }

  return storage as UiStorage;
}

function readSidebarCollapsed(): boolean {
  const storage = resolveUiStorage();

  if (!storage) {
    return false;
  }

  return storage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
}

function writeSidebarCollapsed(collapsed: boolean) {
  const storage = resolveUiStorage();

  if (!storage) {
    return;
  }

  storage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
}

function readTheme(): ThemeMode {
  const storage = resolveUiStorage();

  if (!storage) {
    return 'dark';
  }

  return storage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
}

function writeTheme(theme: ThemeMode) {
  const storage = resolveUiStorage();

  if (!storage) {
    return;
  }

  storage.setItem(THEME_STORAGE_KEY, theme);
}

function readCrosshairMagnet(): boolean {
  const storage = resolveUiStorage();

  if (!storage) {
    return false;
  }

  const value = storage.getItem(CROSSHAIR_MAGNET_STORAGE_KEY);
  return value === 'true';
}

function writeCrosshairMagnet(enabled: boolean) {
  const storage = resolveUiStorage();

  if (!storage) {
    return;
  }

  storage.setItem(CROSSHAIR_MAGNET_STORAGE_KEY, String(enabled));
}

export const useUiStore = create<UiState>((set, get) => ({
  isSidebarCollapsed: readSidebarCollapsed(),
  theme: readTheme(),
  isCrosshairMagnetEnabled: readCrosshairMagnet(),
  setSidebarCollapsed: (collapsed: boolean) => {
    writeSidebarCollapsed(collapsed);
    set({ isSidebarCollapsed: collapsed });
  },
  setTheme: (theme: ThemeMode) => {
    writeTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const nextTheme = get().theme === 'dark' ? 'light' : 'dark';
    writeTheme(nextTheme);
    set({ theme: nextTheme });
  },
  toggleSidebar: () => {
    const nextValue = !get().isSidebarCollapsed;
    writeSidebarCollapsed(nextValue);
    set({ isSidebarCollapsed: nextValue });
  },
  toggleCrosshairMagnet: () => {
    const nextValue = !get().isCrosshairMagnetEnabled;
    writeCrosshairMagnet(nextValue);
    set({ isCrosshairMagnetEnabled: nextValue });
  },
}));
