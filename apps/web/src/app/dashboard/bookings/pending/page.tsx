'use client';

import { useEffect, useState } from 'react';
import { useBookingStore } from '@/stores/booking-store';
import { useAuthStore } from '@/stores/auth-store';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDateTimeInUserTimezone, getTimeRangeInUserTimezone } from '@/lib/timezone';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import DashboardPageHeader from '@/components/DashboardPageHeader';
import DashboardPageContainer from '@/components/DashboardPageContainer';
import { Clock, User, Mail, Phone, Calendar, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function PendingBookingsPage() {
  const { isAuthenticated, user } = useAuthStore();
  const {
    pendingBookings,
    isLoading,
    error,
    fetchPendingBookings,
    approveBooking,
    declineBooking,
  } = useBookingStore();

  const [approvingBookings, setApprovingBookings] = useState<Set<string>>(new Set());
  const [decliningBookings, setDecliningBookings] = useState<Set<string>>(new Set());
  const [declineReason, setDeclineReason] = useState<string>('');
  const [selectedBookingForDecline, setSelectedBookingForDecline] = useState<string | null>(null);

  const userTimezone = useUserTimezone();

  useEffect(() => {
    // Only fetch data when user is authenticated and user data is loaded
    if (isAuthenticated && user) {
      fetchPendingBookings();
    }
  }, [isAuthenticated, user, fetchPendingBookings]);

  const handleApproveBooking = async (bookingId: string) => {
    const newApprovingBookings = new Set(approvingBookings);
    newApprovingBookings.add(bookingId);
    setApprovingBookings(newApprovingBookings);

    try {
      await approveBooking(bookingId);
      toast.success('Booking approved successfully!');
      // Remove from pending list immediately
      fetchPendingBookings();
    } catch (error) {
      toast.error('Failed to approve booking');
    } finally {
      const updatedApprovingBookings = new Set(approvingBookings);
      updatedApprovingBookings.delete(bookingId);
      setApprovingBookings(updatedApprovingBookings);
    }
  };

  const handleDeclineBooking = async (bookingId: string) => {
    if (!declineReason.trim()) {
      toast.error('Please provide a reason for declining');
      return;
    }

    const newDecliningBookings = new Set(decliningBookings);
    newDecliningBookings.add(bookingId);
    setDecliningBookings(newDecliningBookings);

    try {
      await declineBooking(bookingId, declineReason);
      toast.success('Booking declined successfully');
      setDeclineReason('');
      setSelectedBookingForDecline(null);
      // Remove from pending list immediately
      fetchPendingBookings();
    } catch (error) {
      toast.error('Failed to decline booking');
    } finally {
      const updatedDecliningBookings = new Set(decliningBookings);
      updatedDecliningBookings.delete(bookingId);
      setDecliningBookings(updatedDecliningBookings);
    }
  };

  const formatBookingTime = (startTime: string, endTime: string) => {
    if (!userTimezone) return '';
    return getTimeRangeInUserTimezone(startTime, endTime, userTimezone);
  };

  const formatBookingDate = (startTime: string) => {
    if (!userTimezone) return '';
    return formatDateTimeInUserTimezone(startTime, userTimezone, {
      dateStyle: 'full',
    });
  };

  if (isLoading && pendingBookings.length === 0) {
    return (
      <DashboardPageContainer>
        <DashboardPageHeader
          title="Pending Bookings"
          description="Review and approve or decline booking requests"
        />
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </DashboardPageContainer>
    );
  }

  if (error) {
    return (
      <DashboardPageContainer>
        <DashboardPageHeader
          title="Pending Bookings"
          description="Review and approve or decline booking requests"
        />
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => fetchPendingBookings()}>
            Try Again
          </Button>
        </div>
      </DashboardPageContainer>
    );
  }

  return (
    <DashboardPageContainer>
      <DashboardPageHeader
        title="Pending Bookings"
        description="Review and approve or decline booking requests"
      />

      {pendingBookings.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center space-y-4">
            <Calendar className="h-12 w-12 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900">No Pending Bookings</h3>
            <p className="text-gray-500">
              All booking requests have been reviewed. New requests will appear here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {pendingBookings.map((booking) => (
            <Card key={booking.id} className="p-6 border-l-4 border-l-yellow-400">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {booking.meetingType.name}
                    </h3>
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                      <Clock className="h-3 w-3 mr-1" />
                      Pending Approval
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-4 w-4 mr-2" />
                        <span className="font-medium">Date:</span>
                        <span className="ml-1">{formatBookingDate(booking.startTime)}</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <Clock className="h-4 w-4 mr-2" />
                        <span className="font-medium">Time:</span>
                        <span className="ml-1">{formatBookingTime(booking.startTime, booking.endTime)}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {booking.attendees.map((attendee, index) => (
                        <div key={index} className="space-y-1">
                          <div className="flex items-center text-sm text-gray-600">
                            <User className="h-4 w-4 mr-2" />
                            <span className="font-medium">Name:</span>
                            <span className="ml-1">{attendee.name}</span>
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <Mail className="h-4 w-4 mr-2" />
                            <span className="font-medium">Email:</span>
                            <span className="ml-1">{attendee.email}</span>
                          </div>
                          {attendee.phoneNumber && (
                            <div className="flex items-center text-sm text-gray-600">
                              <Phone className="h-4 w-4 mr-2" />
                              <span className="font-medium">Phone:</span>
                              <span className="ml-1">{attendee.phoneNumber}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {booking.description && (
                    <div className="mb-4">
                      <span className="text-sm font-medium text-gray-600">Description:</span>
                      <p className="text-sm text-gray-700 mt-1">{booking.description}</p>
                    </div>
                  )}

                  {booking.notes && (
                    <div className="mb-4">
                      <span className="text-sm font-medium text-gray-600">Notes:</span>
                      <p className="text-sm text-gray-700 mt-1">{booking.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Decline Reason Input */}
              {selectedBookingForDecline === booking.id && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason for declining (optional):
                  </label>
                  <Textarea
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="e.g., I have a conflict at that time. Please book another slot."
                    rows={3}
                    className="w-full"
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => handleApproveBooking(booking.id)}
                  disabled={approvingBookings.has(booking.id)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {approvingBookings.has(booking.id) ? 'Approving...' : 'Approve'}
                </Button>

                {selectedBookingForDecline === booking.id ? (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleDeclineBooking(booking.id)}
                      disabled={decliningBookings.has(booking.id)}
                      variant="destructive"
                    >
                      {decliningBookings.has(booking.id) ? 'Declining...' : 'Confirm Decline'}
                    </Button>
                    <Button
                      onClick={() => {
                        setSelectedBookingForDecline(null);
                        setDeclineReason('');
                      }}
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => setSelectedBookingForDecline(booking.id)}
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Decline
                  </Button>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Requested on {formatDateTimeInUserTimezone(booking.createdAt, userTimezone || 'UTC')}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardPageContainer>
  );
}
