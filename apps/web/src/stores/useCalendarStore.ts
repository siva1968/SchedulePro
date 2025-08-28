import { create } from 'zustand';
import { CalendarIntegration, CreateCalendarIntegrationRequest, UpdateCalendarIntegrationRequest, CalendarSyncResult, CalendarConflict } from '@/types/calendar';
import { apiClient } from '@/lib/api-client';

interface CalendarState {
  integrations: CalendarIntegration[];
  selectedIntegration: CalendarIntegration | null;
  conflicts: CalendarConflict[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchIntegrations: () => Promise<void>;
  fetchIntegration: (id: string) => Promise<void>;
  createIntegration: (data: CreateCalendarIntegrationRequest) => Promise<CalendarIntegration>;
  updateIntegration: (id: string, data: UpdateCalendarIntegrationRequest) => Promise<CalendarIntegration>;
  deleteIntegration: (id: string) => Promise<void>;
  syncBookingToCalendar: (bookingId: string) => Promise<CalendarSyncResult[]>;
  removeBookingFromCalendar: (bookingId: string) => Promise<any>;
  checkConflicts: (startTime: string, endTime: string) => Promise<CalendarConflict[]>;
  clearError: () => void;
  setSelectedIntegration: (integration: CalendarIntegration | null) => void;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  integrations: [],
  selectedIntegration: null,
  conflicts: [],
  isLoading: false,
  error: null,

  fetchIntegrations: async () => {
    set({ isLoading: true, error: null });
    try {
      const integrations = await apiClient.getCalendarIntegrations() as CalendarIntegration[];
      set({ integrations, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch calendar integrations',
        isLoading: false 
      });
    }
  },

  fetchIntegration: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const integration = await apiClient.getCalendarIntegration(id) as CalendarIntegration;
      set({ selectedIntegration: integration, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch calendar integration',
        isLoading: false 
      });
    }
  },

  createIntegration: async (data: CreateCalendarIntegrationRequest) => {
    set({ isLoading: true, error: null });
    try {
      const integration = await apiClient.createCalendarIntegration(data) as CalendarIntegration;
      
      // Add to integrations list
      const { integrations } = get();
      set({ 
        integrations: [...integrations, integration],
        isLoading: false 
      });
      
      return integration;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create calendar integration';
      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  updateIntegration: async (id: string, data: UpdateCalendarIntegrationRequest) => {
    set({ isLoading: true, error: null });
    try {
      const updatedIntegration = await apiClient.updateCalendarIntegration(id, data) as CalendarIntegration;
      
      // Update in integrations list
      const { integrations } = get();
      const updatedIntegrations = integrations.map(integration =>
        integration.id === id ? updatedIntegration : integration
      );
      
      set({ 
        integrations: updatedIntegrations,
        selectedIntegration: get().selectedIntegration?.id === id ? updatedIntegration : get().selectedIntegration,
        isLoading: false 
      });
      
      return updatedIntegration;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update calendar integration';
      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  deleteIntegration: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.deleteCalendarIntegration(id);
      
      // Remove from integrations list
      const { integrations } = get();
      const filteredIntegrations = integrations.filter(integration => integration.id !== id);
      
      set({ 
        integrations: filteredIntegrations,
        selectedIntegration: get().selectedIntegration?.id === id ? null : get().selectedIntegration,
        isLoading: false 
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete calendar integration';
      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  syncBookingToCalendar: async (bookingId: string) => {
    set({ isLoading: true, error: null });
    try {
      const results = await apiClient.syncBookingToCalendar(bookingId) as CalendarSyncResult[];
      set({ isLoading: false });
      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync booking to calendar';
      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  removeBookingFromCalendar: async (bookingId: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await apiClient.removeBookingFromCalendar(bookingId);
      set({ isLoading: false });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove booking from calendar';
      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  checkConflicts: async (startTime: string, endTime: string) => {
    set({ isLoading: true, error: null });
    try {
      const conflicts = await apiClient.checkCalendarConflicts(startTime, endTime) as CalendarConflict[];
      set({ conflicts, isLoading: false });
      return conflicts;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to check calendar conflicts';
      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  clearError: () => set({ error: null }),

  setSelectedIntegration: (integration: CalendarIntegration | null) => {
    set({ selectedIntegration: integration });
  },
}));
