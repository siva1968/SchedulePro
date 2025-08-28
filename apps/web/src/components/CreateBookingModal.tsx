'use client';

import { useState, useEffect } from 'react';
import { useBookingStore } from '@/stores/booking-store';
import { apiClient } from '@/lib/api-client';

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

interface CreateBookingData {
  meetingTypeId: string;
  startTime: string;
  endTime: string;
  title: string;
  description: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone: string;
}

export default function CreateBookingModal({ isOpen, onClose, onSuccess }: CreateBookingModalProps) {
  const { createBooking } = useBookingStore();
  const [formData, setFormData] = useState<CreateBookingData>({
    meetingTypeId: '',
    startTime: '',
    endTime: '',
    title: '',
    description: '',
    attendeeName: '',
    attendeeEmail: '',
    attendeePhone: '',
  });
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      loadMeetingTypes();
    }
  }, [isOpen]);

  const loadMeetingTypes = async () => {
    try {
      const data = await apiClient.getMeetingTypes() as MeetingType[];
      setMeetingTypes(data);
    } catch (error) {
      console.error('Failed to load meeting types:', error);
    }
  };

  const handleMeetingTypeChange = (meetingTypeId: string) => {
    const meetingType = meetingTypes.find(mt => mt.id === meetingTypeId);
    if (meetingType && formData.startTime) {
      // Parse the datetime-local input as local time
      const [datePart, timePart] = formData.startTime.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      
      // Create date in local timezone
      const startDate = new Date(year, month - 1, day, hours, minutes);
      const endDate = new Date(startDate.getTime() + meetingType.duration * 60000);
      
      // Format back to datetime-local format
      const formatLocalDateTime = (date: Date) => {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      };
      
      const formattedEndTime = formatLocalDateTime(endDate);
      
      console.log('DEBUG - Meeting type change calculation:', {
        meetingTypeId,
        duration: meetingType.duration,
        originalStartTime: formData.startTime,
        parsedStart: startDate.toString(),
        calculatedEnd: endDate.toString(),
        formattedEndTime
      });
      
      setFormData(prev => ({
        ...prev,
        meetingTypeId,
        endTime: formattedEndTime,
      }));
    } else {
      setFormData(prev => ({ ...prev, meetingTypeId }));
    }
  };

  const handleStartTimeChange = (startTime: string) => {
        console.log('====== DEBUG v2 - handleStartTimeChange START ======');
        console.log('DEBUG v2 - handleStartTimeChange called with:', startTime);
        console.log('DEBUG v2 - Current meetingTypeId:', formData.meetingTypeId);
        
        // Check if meeting type is selected first
        if (!formData.meetingTypeId) {
          alert('Please select a meeting type first before choosing the start time.');
          return;
        }
        
        console.log('DEBUG v2 - Available meeting types:', meetingTypes.map(mt => ({ id: mt.id, name: mt.name, duration: mt.duration })));
        
        const meetingType = meetingTypes.find(mt => mt.id === formData.meetingTypeId);
        console.log('DEBUG v2 - Found meeting type:', meetingType);
        
        if (meetingType && startTime) {
          // Test with a known example first
          console.log('DEBUG v2 - Testing with known time: 2024-08-30T09:30');
          const testTime = '2024-08-30T09:30';
          const [testDatePart, testTimePart] = testTime.split('T');
          const [testYear, testMonth, testDay] = testDatePart.split('-').map(Number);
          const [testHours, testMinutes] = testTimePart.split(':').map(Number);
          const testStart = new Date(testYear, testMonth - 1, testDay, testHours, testMinutes);
          const testEnd = new Date(testStart.getTime() + 30 * 60000); // 30 minute meeting
          console.log('DEBUG v2 - Test calculation:', {
            testInput: testTime,
            testStartDate: testStart.toString(),
            testEndDate: testEnd.toString(),
            testStartHours: testStart.getHours(),
            testStartMinutes: testStart.getMinutes(),
            testEndHours: testEnd.getHours(),
            testEndMinutes: testEnd.getMinutes()
          });
          
          // Now do the actual calculation
          const [datePart, timePart] = startTime.split('T');
          if (datePart && timePart) {
            const [year, month, day] = datePart.split('-').map(Number);
            const [hours, minutes] = timePart.split(':').map(Number);
            
            console.log('DEBUG v2 - Parsing input:', { datePart, timePart, year, month, day, hours, minutes });
            
            // Create date in local timezone
            const startDate = new Date(year, month - 1, day, hours, minutes);
            console.log('DEBUG v2 - Created startDate:', startDate.toString());
            console.log('DEBUG v2 - startDate details:', {
              getTime: startDate.getTime(),
              getFullYear: startDate.getFullYear(),
              getMonth: startDate.getMonth(),
              getDate: startDate.getDate(),
              getHours: startDate.getHours(),
              getMinutes: startDate.getMinutes()
            });
            
            const endDate = new Date(startDate.getTime() + meetingType.duration * 60000);
            console.log('DEBUG v2 - Created endDate:', endDate.toString());
            console.log('DEBUG v2 - endDate details:', {
              getTime: endDate.getTime(),
              getFullYear: endDate.getFullYear(),
              getMonth: endDate.getMonth(),
              getDate: endDate.getDate(),
              getHours: endDate.getHours(),
              getMinutes: endDate.getMinutes()
            });
            
            // Format back to datetime-local format
            const formatLocalDateTime = (date: Date) => {
              const year = date.getFullYear();
              const month = (date.getMonth() + 1).toString().padStart(2, '0');
              const day = date.getDate().toString().padStart(2, '0');
              const hours = date.getHours().toString().padStart(2, '0');
              const minutes = date.getMinutes().toString().padStart(2, '0');
              return `${year}-${month}-${day}T${hours}:${minutes}`;
            };
            
            const formattedEndTime = formatLocalDateTime(endDate);
            
            console.log('DEBUG v2 - Time calculation FINAL:', {
              originalStartTime: startTime,
              parsedStart: startDate.toString(),
              duration: meetingType.duration,
              calculatedEnd: endDate.toString(),
              formattedEndTime,
              startHours: hours,
              startMinutes: minutes,
              endHours: endDate.getHours(),
              endMinutes: endDate.getMinutes()
            });        setFormData(prev => ({
          ...prev,
          startTime,
          endTime: formattedEndTime,
        }));
      } else {
        console.log('DEBUG - Invalid startTime format:', startTime);
        setFormData(prev => ({ ...prev, startTime }));
      }
    } else {
      console.log('DEBUG - Missing meeting type or startTime');
      setFormData(prev => ({ ...prev, startTime }));
    }
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
      if (!formData.startTime) {
        newErrors.startTime = 'Start time is required';
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

      // Create booking
      await createBooking({
        meetingTypeId: formData.meetingTypeId,
        startTime: formData.startTime,
        endTime: formData.endTime,
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
              onChange={(e) => handleMeetingTypeChange(e.target.value)}
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

          {/* Start Time */}
          <div>
            <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-1">
              Start Time *
            </label>
            <input
              type="datetime-local"
              id="startTime"
              value={formData.startTime}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                errors.startTime ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={isLoading}
              required
            />
            {errors.startTime && <p className="mt-1 text-sm text-red-600">{errors.startTime}</p>}
          </div>

          {/* End Time (auto-calculated) */}
          <div>
            <label htmlFor="endTime" className="block text-sm font-medium text-gray-700 mb-1">
              End Time
            </label>
            <input
              type="datetime-local"
              id="endTime"
              value={formData.endTime}
              onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              disabled={isLoading}
              readOnly
            />
          </div>

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
