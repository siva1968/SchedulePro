'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBookingStore } from '@/stores/booking-store';
import { useAuthStore } from '@/stores/auth-store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DashboardPageHeader from '@/components/DashboardPageHeader';
import DashboardPageContainer from '@/components/DashboardPageContainer';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { bookings, currentBooking, isLoading, fetchBooking } = useBookingStore();
  
  const bookingId = params.bookingId as string;
  const booking = bookings.find(b => b.id === bookingId) || currentBooking;

  useEffect(() => {
    if (isAuthenticated && user && bookingId && !booking) {
      fetchBooking(bookingId);
    }
  }, [isAuthenticated, user, bookingId, booking, fetchBooking]);

  const handleGoBack = () => {
    router.push('/dashboard/bookings');
  };

  const handleApprove = () => {
    router.push(`/dashboard/bookings/${bookingId}/approve`);
  };

  const handleDecline = () => {
    router.push(`/dashboard/bookings/${bookingId}/decline`);
  };

  if (!isAuthenticated || !user) {
    return (
      <DashboardPageContainer>
        <div className="flex items-center justify-center h-64">
          <p>Please log in to view this page.</p>
        </div>
      </DashboardPageContainer>
    );
  }

  if (isLoading || !booking) {
    return (
      <DashboardPageContainer>
        <div className="flex items-center justify-center h-64">
          <p>Loading booking details...</p>
        </div>
      </DashboardPageContainer>
    );
  }

  return (
    <DashboardPageContainer>
      <DashboardPageHeader 
        title="Booking Details"
        description="View and manage this booking"
      />

      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={handleGoBack}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Bookings
          </Button>
        </div>

        <Card className="p-6">
          <div className="space-y-6">
            {/* Status Badge */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Booking Information</h2>
              <Badge 
                variant={
                  booking.status === 'CONFIRMED' ? 'default' :
                  booking.status === 'PENDING' ? 'secondary' :
                  booking.status === 'DECLINED' ? 'destructive' : 'outline'
                }
              >
                {booking.status === 'CONFIRMED' ? 'Approved' :
                 booking.status === 'PENDING' ? 'Pending Approval' :
                 booking.status === 'DECLINED' ? 'Declined' :
                 booking.status}
              </Badge>
            </div>

            {/* Status Messages */}
            {booking.status === 'CONFIRMED' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800">
                    This booking has been approved!
                  </span>
                </div>
              </div>
            )}

            {booking.status === 'DECLINED' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span className="font-medium text-red-800">
                    This booking has been declined.
                  </span>
                </div>
              </div>
            )}

            {/* Basic Booking Info */}
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Attendee</p>
                <p className="font-medium">{booking.attendees?.[0]?.name || 'Unknown'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-medium">{booking.attendees?.[0]?.email || 'No email'}</p>
              </div>

              <div>
                <p className="text-sm text-gray-600">Meeting Type</p>
                <p className="font-medium">{booking.meetingType?.name || 'Unknown'}</p>
              </div>

              <div>
                <p className="text-sm text-gray-600">Start Time</p>
                <p className="font-medium">{new Date(booking.startTime).toLocaleString()}</p>
              </div>

              <div>
                <p className="text-sm text-gray-600">End Time</p>
                <p className="font-medium">{new Date(booking.endTime).toLocaleString()}</p>
              </div>
            </div>

            {/* Meeting URL */}
            {booking.meetingUrl && (
              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 mb-2">Meeting Link</p>
                <a 
                  href={booking.meetingUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  {booking.meetingUrl}
                </a>
              </div>
            )}

            {/* Notes */}
            {booking.notes && (
              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 mb-2">Additional Notes</p>
                <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{booking.notes}</p>
              </div>
            )}

            {/* Action Buttons */}
            {booking.status === 'PENDING' && (
              <div className="border-t pt-6">
                <div className="flex gap-3">
                  <Button
                    onClick={handleApprove}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    Approve Booking
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDecline}
                    className="flex-1"
                  >
                    Decline Booking
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </DashboardPageContainer>
  );
}
