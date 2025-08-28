'use client';

import { useEffect } from 'react';
import { X, Calendar, Clock, Users, MapPin, User, CreditCard } from 'lucide-react';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { getTimeRangeInUserTimezone } from '@/lib/timezone';

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
  paymentStatus: string;
  paymentAmount?: number;
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

interface ViewBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
}

const statusColors = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
  RESCHEDULED: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-gray-100 text-gray-800',
  NO_SHOW: 'bg-orange-100 text-orange-800',
};

export default function ViewBookingModal({ isOpen, onClose, booking }: ViewBookingModalProps) {
  const userTimezone = useUserTimezone();

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

  const formatDateTime = (dateString: string) => {
    return getTimeRangeInUserTimezone(dateString, booking.endTime, userTimezone, { 
      includeTimezone: true, 
      sameDay: true 
    });
  };

  const getDuration = () => {
    const start = new Date(booking.startTime);
    const end = new Date(booking.endTime);
    const duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
    return `${duration} minutes`;
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
            <div>
              <h3 className="text-xl font-semibold text-gray-900">
                {booking.title || booking.meetingType.name}
              </h3>
              <div className="mt-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[booking.status as keyof typeof statusColors]}`}>
                  {booking.status}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Date and Time */}
            <div className="flex items-start space-x-3">
              <Calendar className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900">Date & Time</h4>
                <p className="text-sm text-gray-600">
                  {formatDateTime(booking.startTime)}
                </p>
              </div>
            </div>

            {/* Duration */}
            <div className="flex items-start space-x-3">
              <Clock className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900">Duration</h4>
                <p className="text-sm text-gray-600">{getDuration()}</p>
              </div>
            </div>

            {/* Location */}
            <div className="flex items-start space-x-3">
              <MapPin className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900">Location</h4>
                <p className="text-sm text-gray-600">{booking.locationType}</p>
                {booking.meetingUrl && (
                  <a 
                    href={booking.meetingUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-700 underline"
                  >
                    Join Meeting
                  </a>
                )}
              </div>
            </div>

            {/* Host */}
            <div className="flex items-start space-x-3">
              <User className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900">Host</h4>
                <p className="text-sm text-gray-600">
                  {booking.host.firstName} {booking.host.lastName}
                </p>
                <p className="text-sm text-gray-600">{booking.host.email}</p>
              </div>
            </div>

            {/* Attendees */}
            <div className="flex items-start space-x-3">
              <Users className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <h4 className="font-medium text-gray-900">Attendees</h4>
                <div className="space-y-2">
                  {booking.attendees.map((attendee) => (
                    <div key={attendee.id} className="text-sm text-gray-600 border-l-2 border-gray-200 pl-3">
                      <p className="font-medium">{attendee.name}</p>
                      <p>{attendee.email}</p>
                      {attendee.phoneNumber && <p>{attendee.phoneNumber}</p>}
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        attendee.status === 'CONFIRMED' ? 'bg-green-100 text-green-800' :
                        attendee.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {attendee.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Payment */}
            {booking.paymentAmount && (
              <div className="flex items-start space-x-3">
                <CreditCard className="h-5 w-5 text-gray-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-gray-900">Payment</h4>
                  <p className="text-sm text-gray-600">
                    ${booking.paymentAmount.toFixed(2)} - {booking.paymentStatus}
                  </p>
                </div>
              </div>
            )}

            {/* Description */}
            {booking.description && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                <p className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded">
                  {booking.description}
                </p>
              </div>
            )}

            {/* Notes */}
            {booking.notes && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Notes</h4>
                <p className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded">
                  {booking.notes}
                </p>
              </div>
            )}
          </div>

          <div className="mt-8 flex justify-end">
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-transparent rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
