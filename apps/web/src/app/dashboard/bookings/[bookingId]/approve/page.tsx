'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useBookingStore } from '@/stores/booking-store';
import { useAuthStore } from '@/stores/auth-store';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDateTimeInUserTimezone, getTimeRangeInUserTimezone } from '@/lib/timezone';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DashboardPageHeader from '@/components/DashboardPageHeader';
import DashboardPageContainer from '@/components/DashboardPageContainer';
import { Clock, User, Mail, Phone, Calendar, CheckCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function ApproveBookingPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const {
    bookings,
    currentBooking,
    isLoading,
    fetchBooking,
    approveBooking,
  } = useBookingStore();

  const [isApproving, setIsApproving] = useState(false);
  const [isApproved, setIsApproved] = useState(false);

  const userTimezone = useUserTimezone();
  const bookingId = params.bookingId as string;

  // Get the booking from store or current booking
  const booking = bookings.find(b => b.id === bookingId) || currentBooking;

  useEffect(() => {
    if (isAuthenticated && user && bookingId) {
      // If booking is already loaded and it's confirmed, mark as approved
      if (booking && booking.status === 'CONFIRMED') {
        setIsApproved(true);
      } else if (!booking) {
        // Fetch the specific booking if not in store
        fetchBooking(bookingId);
      }
    }
  }, [isAuthenticated, user, bookingId, booking, fetchBooking]);

  // Update approval status when booking changes
  useEffect(() => {
    if (booking && booking.status === 'CONFIRMED') {
      setIsApproved(true);
    }
  }, [booking]);

  const handleApprove = async () => {
    if (!booking || isApproving || isApproved) return;

    setIsApproving(true);
    try {
      await approveBooking(bookingId);
      setIsApproved(true);
      toast.success('Booking approved successfully!');
      
      // Redirect to bookings dashboard after approval
      setTimeout(() => {
        router.push('/dashboard/bookings');
      }, 2000);
    } catch (error) {
      console.error('Error approving booking:', error);
      toast.error('Failed to approve booking');
    } finally {
      setIsApproving(false);
    }
  };

  const handleGoBack = () => {
    router.push('/dashboard/bookings');
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
        title="Approve Booking"
        description="Review and approve this booking request"
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
              <h2 className="text-xl font-semibold">Booking Request</h2>
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

            {/* Already Approved Message */}
            {isApproved && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800">
                    This booking has been approved!
                  </span>
                </div>
                <p className="text-green-700 mt-1">
                  The attendee has been notified and calendar invites have been sent.
                </p>
              </div>
            )}

            {/* Booking Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="font-medium">{booking.attendees[0]?.name || 'Unknown'}</p>
                    <p className="text-sm text-gray-600">Attendee</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="font-medium">{booking.attendees[0]?.email || 'No email'}</p>
                    <p className="text-sm text-gray-600">Email</p>
                  </div>
                </div>

                {booking.attendees[0]?.phoneNumber && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-gray-500" />
                    <div>
                      <p className="font-medium">{booking.attendees[0].phoneNumber}</p>
                      <p className="text-sm text-gray-600">Phone</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="font-medium">
                      {formatDateTimeInUserTimezone(booking.startTime, userTimezone, { dateStyle: 'long' })}
                    </p>
                    <p className="text-sm text-gray-600">Date</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-gray-500" />
                  <div>
                    <p className="font-medium">
                      {getTimeRangeInUserTimezone(booking.startTime, booking.endTime, userTimezone)}
                    </p>
                    <p className="text-sm text-gray-600">Time</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 bg-blue-100 rounded-full flex items-center justify-center">
                    <div className="h-2 w-2 bg-blue-600 rounded-full"></div>
                  </div>
                  <div>
                    <p className="font-medium">{booking.meetingType?.name}</p>
                    <p className="text-sm text-gray-600">Meeting Type</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {booking.notes && (
              <div className="border-t pt-4">
                <h3 className="font-medium mb-2">Additional Notes</h3>
                <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{booking.notes}</p>
              </div>
            )}

            {/* Action Buttons */}
            {!isApproved && booking.status === 'PENDING' && (
              <div className="border-t pt-6">
                <div className="flex gap-3">
                  <Button
                    onClick={handleApprove}
                    disabled={isApproving}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {isApproving ? 'Approving...' : 'Approve Booking'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/dashboard/bookings/${bookingId}/decline`)}
                    className="flex-1"
                  >
                    Decline
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
