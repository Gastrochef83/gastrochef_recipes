import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../api/auth-api';
import { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  setUser: (user: User | null) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      loading: false,
      error: null,
      
      setUser: (user) => set({ user }),
      setError: (error) => set({ error }),
      setLoading: (loading) => set({ loading }),
      
      login: async (email, password) => {
        set({ loading: true, error: null });
        try {
          const data = await authApi.signIn(email, password);
          const userProfile = await authApi.getUserProfile(data.user.id);
          set({ user: userProfile, loading: false });
        } catch (error: any) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },
      
      register: async (email, password, fullName) => {
        set({ loading: true, error: null });
        try {
          await authApi.signUp(email, password, fullName);
          const data = await authApi.signIn(email, password);
          const userProfile = await authApi.getUserProfile(data.user.id);
          set({ user: userProfile, loading: false });
        } catch (error: any) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },
      
      logout: async () => {
        set({ loading: true });
        try {
          await authApi.signOut();
          set({ user: null, loading: false });
        } catch (error: any) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },
      
      checkAuth: async () => {
        set({ loading: true });
        try {
          const currentUser = await authApi.getCurrentUser();
          if (currentUser) {
            const userProfile = await authApi.getUserProfile(currentUser.id);
            set({ user: userProfile });
          }
          set({ loading: false });
        } catch (error: any) {
          set({ error: error.message, loading: false });
        }
      }
    }),
    {
      name: 'auth-storage',
    }
  )
);