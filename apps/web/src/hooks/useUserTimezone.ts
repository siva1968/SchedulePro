import { useAuthStore } from '@/stores/auth-store';
import { getSystemTimezone } from '@/lib/timezone';

export const useUserTimezone = (): string => {
  const user = useAuthStore((state) => state.user);
  return user?.timezone || getSystemTimezone();
};
