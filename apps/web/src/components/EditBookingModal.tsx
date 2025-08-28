'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, Clock, Users, MapPin, Globe } from 'lucide-react';
import { useBookingStore } from '@/stores/booking-store';
import TimezoneSelect from './TimezoneSelect';
import { getSystemTimezone, convertToTimezone, formatTimeInTimezone } from '@/lib/timezone';

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

interface EditBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  onSuccess?: () => void;
}

export default function EditBookingModal({ isOpen, onClose, booking, onSuccess }: EditBookingModalProps) {
  const { updateBooking, isLoading } = useBookingStore();
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    notes: '',
    startTime: '',
    endTime: '',
    locationType: 'ONLINE',
    meetingUrl: '',
    timezone: getSystemTimezone(),
  });

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (booking) {
      const startTime = new Date(booking.startTime);
      const endTime = new Date(booking.endTime);
      
      setFormData({
        title: booking.title || '',
        description: booking.description || '',
        notes: booking.notes || '',
        startTime: startTime.toISOString().slice(0, 16), // Format for datetime-local input
        endTime: endTime.toISOString().slice(0, 16),
        locationType: booking.locationType || 'ONLINE',
        meetingUrl: booking.meetingUrl || '',
        timezone: getSystemTimezone(),
      });
    }
  }, [booking]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen || !booking) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      // Create Date objects from the datetime-local inputs (assumes local time)
      const startTime = new Date(formData.startTime);
      const endTime = new Date(formData.endTime);

      // Validate times
      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        setError('Please enter valid start and end times');
        return;
      }

      if (startTime >= endTime) {
        setError('End time must be after start time');
        return;
      }

      // Check if the duration is reasonable (at least 5 minutes)
      const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
      if (durationMinutes < 5) {
        setError('Meeting duration must be at least 5 minutes');
        return;
      }

      // Convert times to the selected timezone for API submission
      const startTimeInSelectedTZ = convertToTimezone(startTime, formData.timezone);
      const endTimeInSelectedTZ = convertToTimezone(endTime, formData.timezone);

      if (startTimeInSelectedTZ < new Date()) {
        setError('Start time cannot be in the past');
        return;
      }

      await updateBooking(booking.id, {
        title: formData.title || undefined,
        description: formData.description || undefined,
        notes: formData.notes || undefined,
        startTime: startTimeInSelectedTZ.toISOString(),
        endTime: endTimeInSelectedTZ.toISOString(),
        locationType: formData.locationType,
        meetingUrl: formData.locationType === 'ONLINE' ? formData.meetingUrl : undefined,
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update booking');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'startTime' && booking) {
      // Auto-adjust end time when start time changes to maintain duration
      const newStartTime = new Date(value);
      const originalDuration = booking.meetingType.duration; // Duration in minutes
      const newEndTime = new Date(newStartTime.getTime() + originalDuration * 60000);
      
      setFormData(prev => ({ 
        ...prev, 
        [name]: value,
        endTime: newEndTime.toISOString().slice(0, 16)
      }));
    } else if (name === 'timezone') {
      // When timezone changes, convert existing times to the new timezone
      const startTime = new Date(formData.startTime);
      const endTime = new Date(formData.endTime);
      
      if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
        const newStartTime = convertToTimezone(startTime, value);
        const newEndTime = convertToTimezone(endTime, value);
        
        setFormData(prev => ({
          ...prev,
          [name]: value,
          startTime: newStartTime.toISOString().slice(0, 16),
          endTime: newEndTime.toISOString().slice(0, 16)
        }));
      } else {
        setFormData(prev => ({ ...prev, [name]: value }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl overflow-y-auto max-h-[90vh]">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <h3 className="text-xl font-semibold text-gray-900">
              Edit Booking
            </h3>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="inline h-4 w-4 mr-1" />
                Title (Optional)
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Meeting title..."
              />
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-2">
                  <Clock className="inline h-4 w-4 mr-1" />
                  Start Time
                </label>
                <input
                  type="datetime-local"
                  id="startTime"
                  name="startTime"
                  value={formData.startTime}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="endTime" className="block text-sm font-medium text-gray-700 mb-2">
                  <Clock className="inline h-4 w-4 mr-1" />
                  End Time
                </label>
                <input
                  type="datetime-local"
                  id="endTime"
                  name="endTime"
                  value={formData.endTime}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            
            {/* Timezone */}
            <div>
              <TimezoneSelect
                value={formData.timezone}
                onChange={(timezone) => handleChange({ target: { name: 'timezone', value: timezone } } as any)}
                label="Timezone"
                showCurrentTime={true}
              />
            </div>
            
            {/* Time adjustment note */}
            <div className="text-sm text-gray-600 -mt-2">
              <span className="flex items-center">
                <Clock className="inline h-3 w-3 mr-1" />
                Note: End time will automatically adjust when you change the start time to maintain the original meeting duration ({booking.meetingType.duration} minutes).
              </span>
            </div>

            {/* Location Type */}
            <div>
              <label htmlFor="locationType" className="block text-sm font-medium text-gray-700 mb-2">
                <MapPin className="inline h-4 w-4 mr-1" />
                Location Type
              </label>
              <select
                id="locationType"
                name="locationType"
                value={formData.locationType}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="ONLINE">Online Meeting</option>
                <option value="IN_PERSON">In Person</option>
                <option value="PHONE">Phone Call</option>
              </select>
            </div>

            {/* Meeting URL for online meetings */}
            {formData.locationType === 'ONLINE' && (
              <div>
                <label htmlFor="meetingUrl" className="block text-sm font-medium text-gray-700 mb-2">
                  Meeting URL
                </label>
                <input
                  type="url"
                  id="meetingUrl"
                  name="meetingUrl"
                  value={formData.meetingUrl}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://zoom.us/j/..."
                />
              </div>
            )}

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Meeting description..."
              />
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
                Internal Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Internal notes (not visible to attendees)..."
              />
            </div>

            {/* Attendees Info (Read-only) */}
            <div>
              <h4 className="block text-sm font-medium text-gray-700 mb-2">
                <Users className="inline h-4 w-4 mr-1" />
                Attendees (Read-only)
              </h4>
              <div className="bg-gray-50 p-3 rounded-md">
                {booking.attendees.map((attendee) => (
                  <div key={attendee.id} className="text-sm text-gray-600 mb-1">
                    <span className="font-medium">{attendee.name}</span> - {attendee.email}
                    {attendee.phoneNumber && <span> - {attendee.phoneNumber}</span>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                To modify attendees, please cancel this booking and create a new one.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-transparent rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
