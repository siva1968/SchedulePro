import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';

interface Booking {
  id: string;
  meetingTypeId: string;
  hostId: string;
  startTime: string;
  endTime: string;
  status: string;
  title?: string;
  description?: string;
  notes?: string;
  locationType: string;
  locationDetails?: any;
  meetingUrl?: string;
  formResponses?: any;
  paymentStatus: string;
  paymentAmount?: number;
  paymentId?: string;
  createdAt: string;
  updatedAt: string;
  attendees: Array<{
    id: string;
    email: string;
    name: string;
    phoneNumber?: string;
    status: string;
  }>;
  meetingType: {
    id: string;
    name: string;
    duration: number;
    price?: number;
  };
  host: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

interface BookingState {
  // State
  bookings: Booking[];
  upcomingBookings: Booking[];
  currentBooking: Booking | null;
  isLoading: boolean;
  error: string | null;
  
  // Pagination
  page: number;
  limit: number;
  total: number;

  // Actions
  fetchBookings: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    meetingTypeId?: string;
    startDate?: string;
    endDate?: string;
  }) => Promise<void>;
  fetchUpcomingBookings: (limit?: number) => Promise<void>;
  fetchBooking: (id: string) => Promise<void>;
  createBooking: (data: {
    meetingTypeId: string;
    startTime: string;
    endTime: string;
    title?: string;
    description?: string;
    notes?: string;
    locationType?: string;
    locationDetails?: any;
    meetingUrl?: string;
    formResponses?: any;
    paymentAmount?: number;
    attendees: Array<{
      email: string;
      name: string;
      phoneNumber?: string;
      userId?: string;
    }>;
  }) => Promise<Booking>;
  updateBooking: (id: string, data: any) => Promise<void>;
  cancelBooking: (id: string, reason?: string) => Promise<void>;
  rescheduleBooking: (id: string, startTime: string, endTime: string) => Promise<void>;
  syncBookingToCalendar: (id: string) => Promise<any>;
  removeBookingFromCalendar: (id: string) => Promise<any>;
  clearError: () => void;
  reset: () => void;
}

export const useBookingStore = create<BookingState>((set, get) => ({
  // Initial state
  bookings: [],
  upcomingBookings: [],
  currentBooking: null,
  isLoading: false,
  error: null,
  page: 1,
  limit: 20,
  total: 0,

  // Actions
  fetchBookings: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.getBookings(params) as {
        bookings: Booking[];
        page: number;
        limit: number;
        total: number;
      };
      set({
        bookings: response.bookings,
        page: response.page,
        limit: response.limit,
        total: response.total,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch bookings',
        isLoading: false,
      });
    }
  },

  fetchUpcomingBookings: async (limit = 10) => {
    set({ isLoading: true, error: null });
    try {
      const upcomingBookings = await apiClient.getUpcomingBookings(limit) as Booking[];
      set({ upcomingBookings, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch upcoming bookings',
        isLoading: false,
      });
    }
  },

  fetchBooking: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const booking = await apiClient.getBooking(id) as Booking;
      set({ currentBooking: booking, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch booking',
        isLoading: false,
      });
    }
  },

  createBooking: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const booking = await apiClient.createBooking(data) as Booking;
      const { bookings } = get();
      set({
        bookings: [booking, ...bookings],
        isLoading: false,
      });
      return booking;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create booking',
        isLoading: false,
      });
      throw error;
    }
  },

  updateBooking: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const updatedBooking = await apiClient.updateBooking(id, data) as Booking;
      const { bookings } = get();
      set({
        bookings: bookings.map((booking) =>
          booking.id === id ? updatedBooking : booking
        ),
        currentBooking: updatedBooking,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update booking',
        isLoading: false,
      });
    }
  },

  cancelBooking: async (id, reason) => {
    set({ isLoading: true, error: null });
    try {
      const cancelledBooking = await apiClient.cancelBooking(id, reason) as Booking;
      const { bookings } = get();
      set({
        bookings: bookings.map((booking) =>
          booking.id === id ? cancelledBooking : booking
        ),
        currentBooking: cancelledBooking,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to cancel booking',
        isLoading: false,
      });
    }
  },

  rescheduleBooking: async (id, startTime, endTime) => {
    set({ isLoading: true, error: null });
    try {
      const rescheduledBooking = await apiClient.rescheduleBooking(id, startTime, endTime) as Booking;
      const { bookings } = get();
      set({
        bookings: bookings.map((booking) =>
          booking.id === id ? rescheduledBooking : booking
        ),
        currentBooking: rescheduledBooking,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to reschedule booking',
        isLoading: false,
      });
    }
  },

  syncBookingToCalendar: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`/api/calendar/sync/booking/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to sync booking to calendar');
      }

      const result = await response.json();
      set({ isLoading: false });
      return result;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to sync booking to calendar',
        isLoading: false,
      });
      throw error;
    }
  },

  removeBookingFromCalendar: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`/api/calendar/sync/booking/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to remove booking from calendar');
      }

      const result = await response.json();
      set({ isLoading: false });
      return result;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to remove booking from calendar',
        isLoading: false,
      });
      throw error;
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set({
    bookings: [],
    upcomingBookings: [],
    currentBooking: null,
    isLoading: false,
    error: null,
    page: 1,
    limit: 20,
    total: 0,
  }),
}));
