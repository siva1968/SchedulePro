import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';

interface AvailabilitySlot {
  id: string;
  userId: string;
  type: 'RECURRING' | 'DATE_SPECIFIC' | 'BLOCKED';
  dayOfWeek?: number;
  startTime: string;
  endTime: string;
  specificDate?: string;
  isBlocked: boolean;
  blockReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  label?: string;
  available?: boolean;
  reason?: string | null;
}

interface AvailabilityState {
  // State
  availability: AvailabilitySlot[];
  availableSlots: TimeSlot[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchAvailability: (params?: {
    type?: string;
    dayOfWeek?: number;
    startDate?: string;
    endDate?: string;
    isBlocked?: boolean;
  }) => Promise<void>;
  createAvailability: (data: {
    type: string;
    dayOfWeek?: number;
    startTime: string;
    endTime: string;
    specificDate?: string;
    isBlocked?: boolean;
    blockReason?: string;
  }) => Promise<void>;
  updateAvailability: (id: string, data: any) => Promise<void>;
  deleteAvailability: (id: string) => Promise<void>;
  createWeeklyAvailability: (weeklySchedule: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>) => Promise<void>;
  getAvailableSlots: (params: {
    date: string;
    duration: number;
    bufferTime?: number;
  }) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useAvailabilityStore = create<AvailabilityState>((set, get) => ({
  // Initial state
  availability: [],
  availableSlots: [],
  isLoading: false,
  error: null,

  // Actions
  fetchAvailability: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const availability = await apiClient.getAvailability(params) as AvailabilitySlot[];
      set({ availability, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch availability',
        isLoading: false,
      });
    }
  },

  createAvailability: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const newAvailability = await apiClient.createAvailability(data) as AvailabilitySlot;
      const { availability } = get();
      set({
        availability: [...availability, newAvailability],
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create availability',
        isLoading: false,
      });
      throw error;
    }
  },

  updateAvailability: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const updatedAvailability = await apiClient.updateAvailability(id, data) as AvailabilitySlot;
      const { availability } = get();
      set({
        availability: availability.map((slot) =>
          slot.id === id ? updatedAvailability : slot
        ),
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update availability',
        isLoading: false,
      });
    }
  },

  deleteAvailability: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.deleteAvailability(id);
      const { availability } = get();
      set({
        availability: availability.filter((slot) => slot.id !== id),
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete availability',
        isLoading: false,
      });
    }
  },

  createWeeklyAvailability: async (weeklySchedule) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.createWeeklyAvailability(weeklySchedule);
      // Refresh availability after creating weekly schedule
      const availability = await apiClient.getAvailability() as AvailabilitySlot[];
      set({ availability, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create weekly availability',
        isLoading: false,
      });
      throw error;
    }
  },

  getAvailableSlots: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const availableSlots = await apiClient.getAvailableSlots(params) as TimeSlot[];
      set({ availableSlots, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to get available slots',
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set({
    availability: [],
    availableSlots: [],
    isLoading: false,
    error: null,
  }),
}));
