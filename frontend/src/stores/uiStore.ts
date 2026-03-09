import { create } from 'zustand';

export const SIDEBAR_STORAGE_KEY = 'quant-admin-sidebar-collapsed';

interface UiState {
  isSidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

function readSidebarCollapsed(): boolean {
  if (typeof localStorage === 'undefined') {
    return false;
  }

  return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
}

function writeSidebarCollapsed(collapsed: boolean) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
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
