import { create } from 'zustand';

export const SIDEBAR_STORAGE_KEY = 'quant-admin-sidebar-collapsed';

type SidebarStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface UiState {
  isSidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

function resolveSidebarStorage(): SidebarStorage | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const storage = localStorage as Partial<SidebarStorage>;

  if (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return null;
  }

  return storage as SidebarStorage;
}

function readSidebarCollapsed(): boolean {
  const storage = resolveSidebarStorage();

  if (!storage) {
    return false;
  }

  return storage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
}

function writeSidebarCollapsed(collapsed: boolean) {
  const storage = resolveSidebarStorage();

  if (!storage) {
    return;
  }

  storage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
}

export const useUiStore = create<UiState>((set, get) => ({
  isSidebarCollapsed: readSidebarCollapsed(),
  setSidebarCollapsed: (collapsed: boolean) => {
    writeSidebarCollapsed(collapsed);
    set({ isSidebarCollapsed: collapsed });
  },
  toggleSidebar: () => {
    const nextValue = !get().isSidebarCollapsed;
    writeSidebarCollapsed(nextValue);
    set({ isSidebarCollapsed: nextValue });
  },
}));
