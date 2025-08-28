class ApiClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;

  constructor() {
    this.baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}/api/v1${endpoint}`;
    
    // Get token from auth store
    const token = localStorage.getItem('access_token');
    
    const config: RequestInit = {
      headers: {
        ...this.defaultHeaders,
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        if (response.status === 401) {
          // Handle unauthorized - logout user
          localStorage.removeItem('access_token');
          window.location.href = '/auth/login';
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle empty responses
      if (response.status === 204) {
        return {} as T;
      }

      return await response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error - please check your connection');
      }
      throw error;
    }
  }

  // Health check
  async healthCheck() {
    return this.request('/health');
  }

  // Auth endpoints
  async login(email: string, password: string) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async logout() {
    return this.request('/auth/logout', {
      method: 'POST',
    });
  }

  async refreshToken() {
    return this.request('/auth/refresh', {
      method: 'POST',
    });
  }

  // User endpoints
  async getCurrentUser() {
    return this.request('/auth/profile');
  }

  async updateProfile(data: {
    firstName?: string;
    lastName?: string;
    timezone?: string;
    language?: string;
    phoneNumber?: string;
  }) {
    return this.request('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Meeting Types endpoints
  async getMeetingTypes() {
    return this.request('/meeting-types');
  }

  async getMeetingType(id: string) {
    return this.request(`/meeting-types/${id}`);
  }

  async createMeetingType(data: {
    name: string;
    description?: string;
    duration: number;
    price?: number;
    isActive?: boolean;
    locationType?: string;
    locationDetails?: any;
    bufferTimeBefore?: number;
    bufferTimeAfter?: number;
    maxBookingsPerDay?: number;
    advanceBookingLimit?: number;
    minimumNotice?: number;
    customFields?: any;
    organizationId?: string;
  }) {
    return this.request('/meeting-types', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMeetingType(id: string, data: {
    name?: string;
    description?: string;
    duration?: number;
    isActive?: boolean;
  }) {
    return this.request(`/meeting-types/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteMeetingType(id: string) {
    return this.request(`/meeting-types/${id}`, {
      method: 'DELETE',
    });
  }

  // Booking management
  async getBookings(params?: {
    page?: number;
    limit?: number;
    status?: string;
    meetingTypeId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }
    
    return this.request(`/bookings?${queryParams.toString()}`);
  }

  async getBooking(id: string) {
    return this.request(`/bookings/${id}`);
  }

  async getUpcomingBookings(limit: number = 10) {
    return this.request(`/bookings/upcoming?limit=${limit}`);
  }

  async createBooking(data: {
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
  }) {
    return this.request('/bookings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBooking(id: string, data: any) {
    return this.request(`/bookings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async cancelBooking(id: string, reason?: string) {
    return this.request(`/bookings/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async rescheduleBooking(id: string, startTime: string, endTime: string) {
    return this.request(`/bookings/${id}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({ startTime, endTime }),
    });
  }

  // Availability management
  async getAvailability(params?: {
    type?: string;
    dayOfWeek?: number;
    startDate?: string;
    endDate?: string;
    isBlocked?: boolean;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
    }
    
    return this.request(`/availability?${queryParams.toString()}`);
  }

  async createAvailability(data: {
    type: string;
    dayOfWeek?: number;
    startTime: string;
    endTime: string;
    specificDate?: string;
    isBlocked?: boolean;
    blockReason?: string;
  }) {
    return this.request('/availability', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAvailability(id: string, data: any) {
    return this.request(`/availability/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteAvailability(id: string) {
    return this.request(`/availability/${id}`, {
      method: 'DELETE',
    });
  }

  async createWeeklyAvailability(weeklySchedule: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>) {
    return this.request('/availability/weekly', {
      method: 'POST',
      body: JSON.stringify(weeklySchedule),
    });
  }

  async getAvailableSlots(params: {
    date: string;
    duration: number;
    bufferTime?: number;
  }) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });
    
    return this.request(`/availability/slots?${queryParams.toString()}`);
  }
}

export const apiClient = new ApiClient();
