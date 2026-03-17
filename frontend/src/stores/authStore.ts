import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { username: string } | null;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          // 模拟API调用 - 实际项目中应该调用后端API
          await new Promise(resolve => setTimeout(resolve, 500));

          // 简单的本地验证（仅用于演示）
          const storedUsers = JSON.parse(localStorage.getItem('users') || '{}');
          if (storedUsers[username] && storedUsers[username].password === password) {
            set({
              isAuthenticated: true,
              user: { username },
              isLoading: false,
            });
            return true;
          }

          // 如果没有注册用户，允许使用 demo/demo 登录
          if (username === 'demo' && password === 'demo') {
            set({
              isAuthenticated: true,
              user: { username },
              isLoading: false,
            });
            return true;
          }

          set({ isLoading: false, error: '用户名或密码错误' });
          return false;
        } catch (error) {
          set({ isLoading: false, error: '登录失败，请重试' });
          return false;
        }
      },

      register: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          // 模拟API调用
          await new Promise(resolve => setTimeout(resolve, 500));

          const storedUsers = JSON.parse(localStorage.getItem('users') || '{}');

          if (storedUsers[username]) {
            set({ isLoading: false, error: '用户名已存在' });
            return false;
          }

          storedUsers[username] = { password };
          localStorage.setItem('users', JSON.stringify(storedUsers));

          set({
            isAuthenticated: true,
            user: { username },
            isLoading: false,
          });
          return true;
        } catch (error) {
          set({ isLoading: false, error: '注册失败，请重试' });
          return false;
        }
      },

      logout: () => {
        set({
          isAuthenticated: false,
          user: null,
          error: null,
        });
      },

      loadFromStorage: () => {
        // 从 storage 加载状态已由 persist 中间件自动处理
        // 这里可以添加额外的初始化逻辑
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
      }),
    }
  )
);
