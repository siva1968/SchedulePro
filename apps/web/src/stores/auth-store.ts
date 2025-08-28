import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  timezone?: string;
  phoneNumber?: string;
  profileImageUrl?: string;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  refreshToken: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (credentials) => {
        set({ isLoading: true });
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(credentials),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Login failed');
          }

          const data = await response.json();
          
          console.log('DEBUG - Login response data:', data);
          console.log('DEBUG - User from response:', data.user);
          console.log('DEBUG - User organizations:', data.user?.organizations);
          
          set({
            user: data.user,
            token: data.access_token,
            isAuthenticated: true,
            isLoading: false,
          });

          // Store token in localStorage for persistence
          localStorage.setItem('access_token', data.access_token);
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: () => {
        localStorage.removeItem('access_token');
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },

      setUser: (user) => set({ user, isAuthenticated: true }),
      
      setToken: (token) => {
        localStorage.setItem('access_token', token);
        set({ token, isAuthenticated: true });
      },

      refreshToken: async () => {
        // TODO: Implement refresh token logic
        const token = localStorage.getItem('access_token');
        console.log('DEBUG - refreshToken called, token exists:', !!token);
        if (!token) {
          get().logout();
          return;
        }
        
        try {
          // Verify token with API
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/auth/me`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          
          if (!response.ok) {
            console.log('DEBUG - refreshToken failed, response not ok:', response.status);
            get().logout();
            return;
          }
          
          const userData = await response.json();
          console.log('DEBUG - refreshToken success, userData:', userData);
          console.log('DEBUG - userData organizations:', userData.organizations);
          set({ user: userData, token, isAuthenticated: true });
        } catch (error) {
          console.log('DEBUG - refreshToken error:', error);
          get().logout();
        }
      },

      initialize: async () => {
        const token = localStorage.getItem('access_token');
        const currentState = get();
        
        console.log('DEBUG - initialize called, token exists:', !!token);
        console.log('DEBUG - initialize current user:', currentState.user);
        
        if (token && currentState.isAuthenticated) {
          // If we have a token and are authenticated, refresh user data
          console.log('DEBUG - initialize calling refreshToken');
          await get().refreshToken();
        } else if (token && !currentState.isAuthenticated) {
          // If we have a token but not authenticated, try to authenticate
          console.log('DEBUG - initialize setting token and calling refreshToken');
          set({ token });
          await get().refreshToken();
        } else {
          console.log('DEBUG - initialize no token, calling logout');
          get().logout();
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
