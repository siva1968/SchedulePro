'use client';

import { useState, useEffect } from 'react';
import { useBookingStore } from '@/stores/booking-store';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient } from '@/lib/api-client';
import TimezoneSelect from './TimezoneSelect';
import { getSystemTimezone, convertToTimezone } from '@/lib/timezone';
import { Globe } from 'lucide-react';

interface CreateBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface MeetingType {
  id: string;
  name: string;
  duration: number;
  description?: string;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  label: string;
  available?: boolean;
  reason?: string | null;
}

interface CreateBookingData {
  meetingTypeId: string;
  selectedDate: string;
  selectedSlot: TimeSlot | null;
  startTime: string;
  endTime: string;
  title: string;
  description: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone: string;
  timezone: string;
  meetingProvider: string;
}

export default function CreateBookingModal({ isOpen, onClose, onSuccess }: CreateBookingModalProps) {
  const { createBooking } = useBookingStore();
  const { user, isAuthenticated, initialize } = useAuthStore();
  const [formData, setFormData] = useState<CreateBookingData>({
    meetingTypeId: '',
    selectedDate: '',
    selectedSlot: null,
    startTime: '',
    endTime: '',
    title: '',
    description: '',
    attendeeName: '',
    attendeeEmail: '',
    attendeePhone: '',
    timezone: getSystemTimezone(),
    meetingProvider: '',
  });
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([]);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [availableMeetingProviders, setAvailableMeetingProviders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize auth if needed when modal opens
  useEffect(() => {
    if (isOpen && !isAuthenticated) {
      console.log('🔐 Auth not ready, initializing...');
      initialize();
    }
  }, [isOpen, isAuthenticated, initialize]);

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      console.log('📅 Modal opened and authenticated, loading data...');
      loadMeetingTypes();
      loadAvailableMeetingProviders();
    }
  }, [isOpen, isAuthenticated]);

  // Ensure default provider is set when modal opens for authenticated users (fallback only)
  useEffect(() => {
    if (isOpen && isAuthenticated && !formData.meetingProvider && !formData.meetingTypeId) {
      const defaultProvider = 'ZOOM';
      console.log('🎯 Setting initial default provider for authenticated user (no meeting type selected):', defaultProvider);
      setFormData(prev => ({ ...prev, meetingProvider: defaultProvider }));
    }
  }, [isOpen, isAuthenticated, formData.meetingProvider, formData.meetingTypeId]);

  // Load available slots when date and meeting type are selected
  useEffect(() => {
    const fetchAvailableSlots = async () => {
      if (!formData.selectedDate || !formData.meetingTypeId || !formData.timezone) {
        console.log('🕐 CreateBookingModal: Missing required fields for slot fetch:', { 
          date: formData.selectedDate, 
          meetingType: formData.meetingTypeId, 
          timezone: formData.timezone 
        });
        setAvailableSlots([]);
        return;
      }

      try {
        // Use API client base URL instead of hardcoded localhost
        const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const url = `${baseURL}/api/v1/public/bookings/available-slots?meetingTypeId=${formData.meetingTypeId}&date=${formData.selectedDate}&timezone=${encodeURIComponent(formData.timezone)}&includeUnavailable=true`;
        console.log('🕐 CreateBookingModal: Fetching slots from:', url);
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to fetch available slots');
        }
        const data = await response.json();
        console.log('🕐 CreateBookingModal: Received slots data:', data);
        
        // Use allSlots if available, fallback to availableSlots for backward compatibility
        const slots = data.allSlots || data.availableSlots || [];
        setAvailableSlots(slots);
      } catch (error) {
        console.error('🕐 CreateBookingModal: Error fetching available slots:', error);
        setAvailableSlots([]);
      }
    };

    fetchAvailableSlots();
  }, [formData.selectedDate, formData.meetingTypeId, formData.timezone]);

  const loadMeetingTypes = async () => {
    try {
      const data = await apiClient.getMeetingTypes() as MeetingType[];
      setMeetingTypes(data);
    } catch (error) {
      console.error('Failed to load meeting types:', error);
    }
  };

  const loadAvailableMeetingProviders = async () => {
    try {
      console.log('🔄 Loading meeting providers...');
      console.log('👤 Current user:', user);
      console.log('🔐 Is authenticated:', isAuthenticated);
      
      // Default configuration - ZOOM is our organization's default
      let defaultProvider = 'ZOOM';
      let availableProviders = ['ZOOM', 'GOOGLE_MEET', 'MICROSOFT_TEAMS'];
      
      // Get default provider from user's first organization if available
      if (user && user.organizations && user.organizations.length > 0) {
        const userOrg = user.organizations[0];
        console.log('🏢 User organization found:', userOrg.name, 'ID:', userOrg.id);
        
        // For now, use hardcoded ZOOM as default since we know that's what's configured
        // In the future, this could fetch the actual organization settings
        defaultProvider = 'ZOOM';
        console.log('🎯 Using organization default provider:', defaultProvider);
      } else {
        console.log('📋 No user organization found, using default providers');
        console.log('   - User exists:', !!user);
        console.log('   - Organizations array:', user?.organizations);
      }
      
      setAvailableMeetingProviders(availableProviders);
      
      // Always set the organization's default meeting provider
      console.log('🏷️ Setting default meeting provider to:', defaultProvider);
      setFormData(prev => ({ ...prev, meetingProvider: defaultProvider }));
      
      console.log('✅ Final default meeting provider:', defaultProvider);
    } catch (error) {
      console.error('❌ Failed to load meeting providers:', error);
      // Fallback to ZOOM as default
      const fallbackProviders = ['ZOOM'];
      setAvailableMeetingProviders(fallbackProviders);
      setFormData(prev => ({ ...prev, meetingProvider: 'ZOOM' }));
    }
  };

  const fetchMeetingTypeProvider = async (meetingTypeId: string) => {
    if (!meetingTypeId) return null;
    
    try {
      console.log('🔍 Fetching meeting type provider info for:', meetingTypeId);
      const providerInfo = await apiClient.getMeetingTypeProviderInfo(meetingTypeId) as {
        effectiveMeetingProvider: string;
        meetingTypeProvider: string;
        organizationDefaultProvider: string;
      };
      
      console.log('📋 Meeting type provider info:', providerInfo);
      
      return providerInfo.effectiveMeetingProvider;
    } catch (error) {
      console.error('❌ Failed to fetch meeting type provider info:', error);
      return null;
    }
  };

  const handleDateChange = (date: string) => {
    setFormData(prev => ({
      ...prev,
      selectedDate: date,
      selectedSlot: null,
      startTime: '',
      endTime: '',
    }));
  };

  const handleSlotSelect = (slot: TimeSlot) => {
    // Only allow selection of available slots
    if (slot.available !== false) {
      setFormData(prev => ({
        ...prev,
        selectedSlot: slot,
        startTime: slot.startTime,
        endTime: slot.endTime,
      }));
    }
  };

  const handleTimezoneChange = (timezone: string) => {
    console.log('🕐 CreateBookingModal: Timezone changing from', formData.timezone, 'to', timezone);
    // When timezone changes, clear selected slot and update timezone
    setFormData(prev => ({
      ...prev,
      timezone,
      selectedSlot: null,
      startTime: '',
      endTime: ''
    }));
    console.log('🕐 CreateBookingModal: FormData updated, useEffect should trigger slot refetch');
    // The useEffect will automatically re-fetch slots with the new timezone
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    try {
      // Validate form
      const newErrors: Record<string, string> = {};
      if (!formData.meetingTypeId) {
        newErrors.meetingTypeId = 'Meeting type is required';
      }
      if (!formData.selectedDate) {
        newErrors.selectedDate = 'Date is required';
      }
      if (!formData.selectedSlot) {
        newErrors.selectedSlot = 'Time slot is required';
      }
      if (!formData.attendeeName.trim()) {
        newErrors.attendeeName = 'Attendee name is required';
      }
      if (!formData.attendeeEmail.trim()) {
        newErrors.attendeeEmail = 'Attendee email is required';
      }
      if (!formData.meetingProvider) {
        newErrors.meetingProvider = 'Meeting provider is required';
      }
      
      // Validate phone number format if provided
      if (formData.attendeePhone.trim() && !/^[\+]?[1-9][\d]{0,15}$/.test(formData.attendeePhone.trim().replace(/[\s\-\(\)\.]/g, ''))) {
        newErrors.attendeePhone = 'Please enter a valid phone number';
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        setIsLoading(false);
        return;
      }

      // Create booking using selected slot times
      await createBooking({
        meetingTypeId: formData.meetingTypeId,
        startTime: formData.selectedSlot!.startTime,
        endTime: formData.selectedSlot!.endTime,
        title: formData.title || `Meeting with ${formData.attendeeName}`,
        description: formData.description,
        locationType: 'ONLINE',
        meetingProvider: formData.meetingProvider,
        timezone: formData.timezone, // Include customer's selected timezone
        attendees: [{
          name: formData.attendeeName.trim(),
          email: formData.attendeeEmail.trim(),
          ...(formData.attendeePhone.trim() && { phoneNumber: formData.attendeePhone.trim() }),
        }],
      });

      // Reset form and close modal
      setFormData({
        meetingTypeId: '',
        startTime: '',
        endTime: '',
        title: '',
        description: '',
        attendeeName: '',
        attendeeEmail: '',
        attendeePhone: '',
        timezone: getSystemTimezone(),
        selectedDate: '',
        selectedSlot: null,
        meetingProvider: '',
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to create booking:', error);
      
      // Check for specific error types
      const errorMessage = error instanceof Error ? error.message : 'Failed to create booking';
      
      if (errorMessage.includes('409') || errorMessage.includes('Conflict')) {
        setErrors({ general: 'This time slot is no longer available. Please select a different time.' });
        // Refresh available slots to show updated availability
        if (formData.selectedDate && formData.meetingTypeId && formData.timezone) {
          console.log('🔄 Refreshing slots after conflict...');
          const refreshSlots = async () => {
            try {
              const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
              const url = `${baseURL}/api/v1/public/bookings/available-slots?meetingTypeId=${formData.meetingTypeId}&date=${formData.selectedDate}&timezone=${encodeURIComponent(formData.timezone)}&includeUnavailable=true`;
              const response = await fetch(url);
              if (response.ok) {
                const data = await response.json();
                setAvailableSlots(data.allSlots || []);
              }
            } catch (refreshError) {
              console.error('Failed to refresh slots:', refreshError);
            }
          };
          refreshSlots();
        }
      } else if (errorMessage.includes('400') || errorMessage.includes('Bad Request')) {
        setErrors({ general: 'Invalid booking details. Please check your information and try again.' });
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        setErrors({ general: 'Session expired. Please refresh the page and try again.' });
      } else {
        setErrors({ general: 'Failed to create booking. Please try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setFormData({
        meetingTypeId: '',
        startTime: '',
        endTime: '',
        title: '',
        description: '',
        attendeeName: '',
        attendeeEmail: '',
        attendeePhone: '',
        timezone: getSystemTimezone(),
        selectedDate: '',
        selectedSlot: null,
        meetingProvider: '',
      });
      setErrors({});
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">Create New Booking</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isLoading}
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errors.general && (
            <div className="bg-red-50 border border-red-300 text-red-600 px-4 py-3 rounded-md">
              {errors.general}
            </div>
          )}

          {/* Meeting Type */}
          <div>
            <label htmlFor="meetingType" className="block text-sm font-medium text-gray-700 mb-1">
              Meeting Type *
            </label>
            <select
              id="meetingType"
              value={formData.meetingTypeId}
              onChange={async (e) => {
                const meetingTypeId = e.target.value;
                setFormData(prev => ({ ...prev, meetingTypeId, selectedDate: '', selectedSlot: null, meetingProvider: '' }));
                
                // Fetch and set the meeting type's preferred provider
                if (meetingTypeId) {
                  const preferredProvider = await fetchMeetingTypeProvider(meetingTypeId);
                  if (preferredProvider) {
                    console.log('🎯 Setting meeting provider from meeting type:', preferredProvider);
                    setFormData(prev => ({ ...prev, meetingProvider: preferredProvider }));
                  }
                }
              }}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                errors.meetingTypeId ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={isLoading}
              required
            >
              <option value="">Select a meeting type</option>
              {meetingTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} ({type.duration} min)
                </option>
              ))}
            </select>
            {errors.meetingTypeId && <p className="mt-1 text-sm text-red-600">{errors.meetingTypeId}</p>}
          </div>

          {/* Timezone - Show after meeting type is selected */}
          {formData.meetingTypeId && (
            <div>
              <TimezoneSelect
                value={formData.timezone}
                onChange={handleTimezoneChange}
                label="Timezone"
                showCurrentTime={true}
              />
            </div>
          )}

          {/* Meeting Provider Selection - Show after meeting type is selected */}
          {formData.meetingTypeId && (
            <div>
              <label htmlFor="meetingProvider" className="block text-sm font-medium text-gray-700 mb-1">
                Meeting Provider *
              </label>
              <select
                id="meetingProvider"
                value={formData.meetingProvider}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, meetingProvider: e.target.value }));
                }}
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.meetingProvider ? 'border-red-300' : 'border-gray-300'
                }`}
                disabled={isLoading}
                required
              >
                <option value="">Select a meeting provider</option>
                {availableMeetingProviders.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider === 'GOOGLE_MEET' ? 'Google Meet' : 
                     provider === 'MICROSOFT_TEAMS' ? 'Microsoft Teams' :
                     provider === 'ZOOM' ? 'Zoom' :
                     provider === 'WEBEX' ? 'Cisco Webex' :
                     provider === 'GOTOMEETING' ? 'GoToMeeting' :
                     provider === 'CUSTOM' ? 'Custom' : provider}
                  </option>
                ))}
              </select>
              {errors.meetingProvider && <p className="mt-1 text-sm text-red-600">{errors.meetingProvider}</p>}
            </div>
          )}

          {/* Date Selection - Only show after meeting type and timezone are selected */}
          {formData.meetingTypeId && formData.timezone && (
            <div>
              <label htmlFor="selectedDate" className="block text-sm font-medium text-gray-700 mb-1">
                Select Date *
              </label>
              <input
                type="date"
                id="selectedDate"
                value={formData.selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.selectedDate ? 'border-red-300' : 'border-gray-300'
                }`}
                disabled={isLoading}
                required
              />
              {errors.selectedDate && <p className="mt-1 text-sm text-red-600">{errors.selectedDate}</p>}
            </div>
          )}

          {/* Available Time Slots - Only show after date is selected */}
          {formData.selectedDate && formData.meetingTypeId && formData.timezone && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time Slots *
              </label>
              
              {/* Legend */}
              <div className="flex items-center space-x-4 mb-3 text-xs text-gray-600">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-white border border-gray-300 rounded mr-1"></div>
                  <span>Available</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-gray-100 border border-gray-200 rounded mr-1 relative">
                    <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-red-500 rounded-full transform translate-x-0.5 -translate-y-0.5"></span>
                  </div>
                  <span>Unavailable</span>
                </div>
              </div>
              
              {/* Time Slots Grid with Enhanced Display */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {availableSlots.length > 0 ? (
                  availableSlots.map((slot, index) => {
                    const isAvailable = slot.available !== false;
                    const isSelected = formData.selectedSlot?.startTime === slot.startTime;
                    
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => isAvailable ? handleSlotSelect(slot) : null}
                        disabled={isLoading || !isAvailable}
                        className={`px-3 py-3 text-sm font-medium border rounded-lg transition-all duration-200 relative group ${
                          isSelected && isAvailable
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-105'
                            : isAvailable
                            ? 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm'
                            : 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                        }`}
                        title={!isAvailable ? (slot.reason === 'BOOKED' ? 'This time slot is already booked' : 'This time slot is not available') : `Click to select ${slot.label}`}
                      >
                        <div className="flex flex-col items-center">
                          <span className="text-sm font-semibold">{slot.label}</span>
                          <span className="text-xs opacity-75 mt-1">
                            {isAvailable ? 'Available' : 'Booked'}
                          </span>
                        </div>
                        {!isAvailable && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></div>
                        )}
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    <div className="flex flex-col items-center">
                      <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="font-medium">No time slots available</p>
                      <p className="text-sm text-gray-400 mt-1">Try selecting a different date</p>
                    </div>
                  </div>
                )}
              </div>
              {errors.selectedSlot && <p className="mt-1 text-sm text-red-600">{errors.selectedSlot}</p>}
            </div>
          )}

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Meeting title (optional)"
              disabled={isLoading}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Meeting description (optional)"
              disabled={isLoading}
            />
          </div>

          {/* Attendee Information */}
          <div className="border-t pt-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Attendee Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Attendee Name */}
              <div>
                <label htmlFor="attendeeName" className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  id="attendeeName"
                  value={formData.attendeeName}
                  onChange={(e) => setFormData({ ...formData, attendeeName: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.attendeeName ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Attendee name"
                  disabled={isLoading}
                  required
                />
                {errors.attendeeName && <p className="mt-1 text-sm text-red-600">{errors.attendeeName}</p>}
              </div>

              {/* Attendee Email */}
              <div>
                <label htmlFor="attendeeEmail" className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  id="attendeeEmail"
                  value={formData.attendeeEmail}
                  onChange={(e) => setFormData({ ...formData, attendeeEmail: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.attendeeEmail ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="attendee@example.com"
                  disabled={isLoading}
                  required
                />
                {errors.attendeeEmail && <p className="mt-1 text-sm text-red-600">{errors.attendeeEmail}</p>}
              </div>
            </div>

            {/* Attendee Phone */}
            <div className="mt-4">
              <label htmlFor="attendeePhone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                id="attendeePhone"
                value={formData.attendeePhone}
                onChange={(e) => setFormData({ ...formData, attendeePhone: e.target.value })}
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.attendeePhone ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Optional phone number (e.g., +1234567890)"
                disabled={isLoading}
              />
              {errors.attendeePhone && <p className="mt-1 text-sm text-red-600">{errors.attendeePhone}</p>}
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-3 pt-6 border-t">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 border border-transparent rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              {isLoading ? 'Creating...' : 'Create Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
