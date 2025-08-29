'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Booking {
  id: string;
  meetingType: {
    id: string;
    name: string;
    duration: number;
  };
  startTime: string;
  endTime: string;
  attendees: Array<{
    name: string;
    email: string;
  }>;
  host: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  label: string;
}

export default function RescheduleBookingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const bookingId = params.bookingId as string;
  const token = searchParams.get('token');
  
  const [booking, setBooking] = useState<Booking | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing token');
      setLoading(false);
      return;
    }

    fetchBookingDetails();
  }, [bookingId, token]);

  useEffect(() => {
    if (selectedDate && booking) {
      fetchAvailableSlots();
    }
  }, [selectedDate, booking]);

  const fetchBookingDetails = async () => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/v1/public/bookings/${bookingId}/cancel?token=${encodeURIComponent(token!)}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch booking details');
      }

      const data = await response.json();
      setBooking(data);
      
      // Set default date to next weekday (Monday-Friday)
      const nextAvailableDate = new Date();
      nextAvailableDate.setDate(nextAvailableDate.getDate() + 1);
      
      // Skip to next Monday if it's weekend
      while (nextAvailableDate.getDay() === 0 || nextAvailableDate.getDay() === 6) {
        nextAvailableDate.setDate(nextAvailableDate.getDate() + 1);
      }
      
      setSelectedDate(nextAvailableDate.toISOString().split('T')[0]);
    } catch (err) {
      console.error('Error fetching booking:', err);
      setError('Failed to load booking details. Please check your link.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableSlots = async () => {
    if (!booking || !selectedDate) return;
    
    setLoadingSlots(true);
    console.log('DEBUG - Fetching slots for:', {
      meetingTypeId: booking.meetingType.id,
      date: selectedDate,
      url: `http://localhost:3001/api/v1/public/bookings/available-slots?meetingTypeId=${booking.meetingType.id}&date=${selectedDate}&timezone=UTC`
    });
    
    try {
      const response = await fetch(
        `http://localhost:3001/api/v1/public/bookings/available-slots?meetingTypeId=${booking.meetingType.id}&date=${selectedDate}&timezone=UTC`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('DEBUG - Response status:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error('Failed to fetch available slots');
      }

      const data = await response.json();
      console.log('DEBUG - Response data:', data);
      
      setAvailableSlots(data.availableSlots || []);
      setSelectedTime(''); // Reset selected time when date changes
      
      // Show message if no slots available
      if (!data.availableSlots || data.availableSlots.length === 0) {
        if (data.message) {
          setError(data.message);
        }
      } else {
        setError(''); // Clear any previous error
      }
    } catch (err) {
      console.error('Error fetching slots:', err);
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedTime) {
      setError('Please select a time slot');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const selectedSlot = availableSlots.find(slot => slot.startTime === selectedTime);
      if (!selectedSlot) {
        throw new Error('Selected time slot is no longer available');
      }

      const response = await fetch(
        `http://localhost:3001/api/v1/public/bookings/${bookingId}/reschedule`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: token!,
            startTime: selectedSlot.startTime,
            endTime: selectedSlot.endTime,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to reschedule booking');
      }

      setSuccess(true);
    } catch (err: any) {
      console.error('Error rescheduling booking:', err);
      setError(err.message || 'Failed to reschedule booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading booking details...</p>
        </div>
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md text-center">
          <div className="text-red-600 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Unable to Load Booking</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link 
            href="/"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md text-center">
          <div className="text-green-600 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Booking Rescheduled</h1>
          <p className="text-gray-600 mb-6">
            Your booking has been successfully rescheduled. You'll receive a confirmation email shortly.
          </p>
          <Link 
            href="/"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  const formatTimeSlot = (startTime: string) => {
    return new Date(startTime).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          <div className="bg-blue-600 px-6 py-4">
            <h1 className="text-2xl font-bold text-white">Reschedule Booking</h1>
          </div>
          
          {booking && (
            <div className="p-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Booking Details</h2>
                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                  <div>
                    <span className="font-medium text-gray-700">Meeting:</span>
                    <span className="ml-2 text-gray-900">{booking.meetingType.name}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Current Date & Time:</span>
                    <span className="ml-2 text-gray-900">
                      {new Date(booking.startTime).toLocaleDateString()} at{' '}
                      {new Date(booking.startTime).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Duration:</span>
                    <span className="ml-2 text-gray-900">{booking.meetingType.duration} minutes</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Host:</span>
                    <span className="ml-2 text-gray-900">
                      {booking.host.firstName} {booking.host.lastName}
                    </span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleReschedule} className="space-y-6">
                <div>
                  <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
                    Select New Date
                  </label>
                  <input
                    type="date"
                    id="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {selectedDate && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Time Slot
                    </label>
                    {loadingSlots ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-gray-600">Loading available times...</p>
                      </div>
                    ) : availableSlots.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2">
                        {availableSlots.map((slot) => (
                          <button
                            key={slot.startTime}
                            type="button"
                            onClick={() => setSelectedTime(slot.startTime)}
                            className={`p-2 text-sm rounded-md border ${
                              selectedTime === slot.startTime
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-900 border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {formatTimeSlot(slot.startTime)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-600 py-4">No available time slots for this date.</p>
                    )}
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <div className="flex">
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">Error</h3>
                        <div className="mt-2 text-sm text-red-700">{error}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex space-x-4">
                  <button
                    type="submit"
                    disabled={submitting || !selectedTime}
                    className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Rescheduling...' : 'Reschedule Booking'}
                  </button>
                  <Link
                    href="/"
                    className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md text-center hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Cancel
                  </Link>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
