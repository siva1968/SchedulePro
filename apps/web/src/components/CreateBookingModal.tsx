'use client';

import { useState, useEffect } from 'react';
import { useBookingStore } from '@/stores/booking-store';
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
}

export default function CreateBookingModal({ isOpen, onClose, onSuccess }: CreateBookingModalProps) {
  const { createBooking } = useBookingStore();
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
  });
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([]);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      loadMeetingTypes();
    }
  }, [isOpen]);

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
        const url = `http://localhost:3001/api/v1/public/bookings/available-slots?meetingTypeId=${formData.meetingTypeId}&date=${formData.selectedDate}&timezone=${encodeURIComponent(formData.timezone)}`;
        console.log('🕐 CreateBookingModal: Fetching slots from:', url);
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to fetch available slots');
        }
        const data = await response.json();
        console.log('🕐 CreateBookingModal: Received slots:', data.availableSlots);
        setAvailableSlots(data.availableSlots || []);
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
    setFormData(prev => ({
      ...prev,
      selectedSlot: slot,
      startTime: slot.startTime,
      endTime: slot.endTime,
    }));
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
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to create booking:', error);
      setErrors({ general: 'Failed to create booking. Please try again.' });
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
              onChange={(e) => setFormData(prev => ({ ...prev, meetingTypeId: e.target.value, selectedDate: '', selectedSlot: null }))}
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
                Available Time Slots *
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {availableSlots.length > 0 ? (
                  availableSlots.map((slot, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleSlotSelect(slot)}
                      className={`px-3 py-2 text-sm border rounded-md transition-colors ${
                        formData.selectedSlot?.startTime === slot.startTime
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                      disabled={isLoading}
                    >
                      {slot.label}
                    </button>
                  ))
                ) : (
                  <div className="col-span-full text-center py-4 text-gray-500">
                    No available time slots for this date
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
