'use client';

import { useEffect, useState } from 'react';
import { useBookingStore } from '@/stores/booking-store';
import { useAuthStore } from '@/stores/auth-store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
        <div className="max-w-4xl mx-auto space-y-6">
          {pendingBookings.map((booking) => (
            <Card key={booking.id} className="p-6">
              <div className="space-y-6">
                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Booking Request</h2>
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                    Pending Approval
                  </Badge>
                </div>

                {/* Booking Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                          {new Date(booking.startTime).toLocaleDateString()}
                        </p>
                        <p className="text-sm text-gray-600">Date</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-gray-500" />
                      <div>
                        <p className="font-medium">
                          {new Date(booking.startTime).toLocaleTimeString()} - {new Date(booking.endTime).toLocaleTimeString()}
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

                {/* Description */}
                {booking.description && (
                  <div className="border-t pt-4">
                    <h3 className="font-medium mb-2">Description</h3>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{booking.description}</p>
                  </div>
                )}

                {/* Decline Reason Input */}
                {selectedBookingForDecline === booking.id && (
                  <div className="border-t pt-4">
                    <div className="space-y-4">
                      <div>
                        <label htmlFor={`declineReason-${booking.id}`} className="block text-sm font-medium text-gray-700 mb-2">
                          Reason for declining *
                        </label>
                        <Textarea
                          id={`declineReason-${booking.id}`}
                          value={declineReason}
                          onChange={(e) => setDeclineReason(e.target.value)}
                          placeholder="Please provide a reason for declining this booking..."
                          rows={4}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="border-t pt-6">
                  {selectedBookingForDecline === booking.id ? (
                    <div className="flex gap-3">
                      <Button
                        onClick={() => {
                          setSelectedBookingForDecline(null);
                          setDeclineReason('');
                        }}
                        variant="outline"
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => handleDeclineBooking(booking.id)}
                        disabled={decliningBookings.has(booking.id) || !declineReason.trim()}
                        variant="destructive"
                        className="flex-1"
                      >
                        {decliningBookings.has(booking.id) ? 'Declining...' : 'Confirm Decline'}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <Button
                        onClick={() => handleApproveBooking(booking.id)}
                        disabled={approvingBookings.has(booking.id)}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {approvingBookings.has(booking.id) ? 'Approving...' : 'Approve Booking'}
                      </Button>
                      <Button
                        onClick={() => setSelectedBookingForDecline(booking.id)}
                        variant="outline"
                        className="flex-1"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Decline
                      </Button>
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-500">
                    Requested on {new Date(booking.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardPageContainer>
  );
}
