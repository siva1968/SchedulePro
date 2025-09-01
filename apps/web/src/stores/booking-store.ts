import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from './auth-store';

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
  meetingProvider?: string;
  timezone?: string;
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
  pendingBookings: Booking[];
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
    meetingProvider?: string;
    timezone?: string; // Customer's selected timezone
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
  approveBooking: (id: string, meetingProvider?: string) => Promise<void>;
  declineBooking: (id: string, reason?: string) => Promise<void>;
  fetchPendingBookings: () => Promise<void>;
  syncBookingToCalendar: (id: string) => Promise<any>;
  removeBookingFromCalendar: (id: string) => Promise<any>;
  setPageSize: (newLimit: number) => void;
  clearError: () => void;
  reset: () => void;
}

export const useBookingStore = create<BookingState>((set, get) => ({
  // Initial state
  bookings: [],
  upcomingBookings: [],
  pendingBookings: [],
  currentBooking: null,
  isLoading: false,
  error: null,
  page: 1,
  limit: 10,
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
      const response = await apiClient.getUpcomingBookings(limit) as {
        bookings: Booking[];
        total: number;
        page: number;
        limit: number;
      };
      set({ upcomingBookings: response.bookings, isLoading: false });
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

  approveBooking: async (id, meetingProvider) => {
    set({ isLoading: true, error: null });
    try {
      const body = meetingProvider ? { meetingProvider } : {};
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/bookings/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to approve booking');
      }

      const approvedBooking = await response.json() as Booking;
      const { bookings, pendingBookings } = get();
      set({
        bookings: bookings.map((booking) =>
          booking.id === id ? approvedBooking : booking
        ),
        pendingBookings: pendingBookings.filter((booking) => booking.id !== id),
        currentBooking: approvedBooking,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to approve booking',
        isLoading: false,
      });
    }
  },

  declineBooking: async (id, reason) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/bookings/${id}/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to decline booking');
      }

      const declinedBooking = await response.json() as Booking;
      const { bookings, pendingBookings } = get();
      set({
        bookings: bookings.map((booking) =>
          booking.id === id ? declinedBooking : booking
        ),
        pendingBookings: pendingBookings.filter((booking) => booking.id !== id),
        currentBooking: declinedBooking,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to decline booking',
        isLoading: false,
      });
    }
  },

  fetchPendingBookings: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.getPendingBookings() as {
        bookings: Booking[];
        total: number;
        page: number;
        limit: number;
      };
      set({
        pendingBookings: response.bookings,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch pending bookings',
        isLoading: false,
      });
    }
  },

  syncBookingToCalendar: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/calendar/sync/booking/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/calendar/sync/booking/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
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

  setPageSize: (newLimit: number) => {
    set({ limit: newLimit, page: 1 }); // Reset to page 1 when changing page size
    // Optionally refetch bookings with new page size
    const { fetchBookings } = get();
    fetchBookings({ page: 1, limit: newLimit });
  },

  clearError: () => set({ error: null }),

  reset: () => set({
    bookings: [],
    upcomingBookings: [],
    pendingBookings: [],
    currentBooking: null,
    isLoading: false,
    error: null,
    page: 1,
    limit: 10,
    total: 0,
  }),
}));
