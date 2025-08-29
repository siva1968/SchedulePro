'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useBookingStore } from '@/stores/booking-store';
import { useAuthStore } from '@/stores/auth-store';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDateTimeInUserTimezone, getTimeRangeInUserTimezone } from '@/lib/timezone';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import CreateBookingModal from '@/components/CreateBookingModal';
import ViewBookingModal from '@/components/ViewBookingModal';
import EditBookingModal from '@/components/EditBookingModal';
import DashboardPageHeader from '@/components/DashboardPageHeader';
import DashboardPageContainer from '@/components/DashboardPageContainer';

const statusColors = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
  RESCHEDULED: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-gray-100 text-gray-800',
  NO_SHOW: 'bg-orange-100 text-orange-800',
};

export default function BookingsPage() {
  const { isAuthenticated, user } = useAuthStore();
  const {
    bookings,
    upcomingBookings,
    pendingBookings,
    isLoading,
    error,
    page,
    limit,
    total,
    fetchBookings,
    fetchUpcomingBookings,
    fetchPendingBookings,
    cancelBooking,
    syncBookingToCalendar,
    removeBookingFromCalendar,
    setPageSize,
  } = useBookingStore();

  const [filter, setFilter] = useState({
    status: '',
    startDate: '',
    endDate: '',
  });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [syncingBookings, setSyncingBookings] = useState<Set<string>>(new Set());
  const userTimezone = useUserTimezone();

  useEffect(() => {
    // Only fetch data when user is authenticated and user data is loaded
    if (isAuthenticated && user) {
      fetchBookings();
      fetchUpcomingBookings(5);
      fetchPendingBookings();
    }
  }, [isAuthenticated, user, fetchBookings, fetchUpcomingBookings, fetchPendingBookings]);

  const handleFilterChange = (key: string, value: string) => {
    setFilter(prev => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    fetchBookings({
      page: 1,
      limit,
      ...(filter.status && { status: filter.status }),
      ...(filter.startDate && { startDate: filter.startDate }),
      ...(filter.endDate && { endDate: filter.endDate }),
    });
  };

  const handleCancelBooking = async (id: string, reason?: string) => {
    try {
      await cancelBooking(id, reason);
      // Refresh bookings
      fetchBookings();
    } catch (error) {
      console.error('Failed to cancel booking:', error);
    }
  };

  const handleViewBooking = (booking: any) => {
    setSelectedBooking(booking);
    setIsViewModalOpen(true);
  };

  const handleEditBooking = (booking: any) => {
    setSelectedBooking(booking);
    setIsEditModalOpen(true);
  };

  const handleModalClose = () => {
    setSelectedBooking(null);
    setIsViewModalOpen(false);
    setIsEditModalOpen(false);
  };

  const handleEditSuccess = () => {
    fetchBookings(); // Refresh the bookings list
  };

  const handleSyncToCalendar = async (bookingId: string) => {
    setSyncingBookings(prev => new Set(prev).add(bookingId));
    try {
      await syncBookingToCalendar(bookingId);
      // Show success message (you can add a toast notification here)
      console.log('Booking synced to calendar successfully');
    } catch (error) {
      console.error('Failed to sync booking to calendar:', error);
      // Show error message (you can add a toast notification here)
    } finally {
      setSyncingBookings(prev => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
    }
  };

  const handleRemoveFromCalendar = async (bookingId: string) => {
    setSyncingBookings(prev => new Set(prev).add(bookingId));
    try {
      await removeBookingFromCalendar(bookingId);
      // Show success message (you can add a toast notification here)
      console.log('Booking removed from calendar successfully');
    } catch (error) {
      console.error('Failed to remove booking from calendar:', error);
      // Show error message (you can add a toast notification here)
    } finally {
      setSyncingBookings(prev => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
    }
  };

  const formatDateTime = (dateString: string) => {
    return formatDateTimeInUserTimezone(dateString, userTimezone, { includeTimezone: true });
  };

  if (isLoading) {
    return (
      <DashboardPageContainer>
        <DashboardPageHeader title="Bookings" description="Manage your appointments and meetings" />
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </DashboardPageContainer>
    );
  }

  return (
    <>
      <DashboardPageHeader 
        title="Bookings" 
        description="Manage your appointments and meetings"
      >
        <div className="flex gap-3">
          <Link href="/dashboard/bookings/pending">
            <Button variant="outline" className="border-yellow-300 text-yellow-700 hover:bg-yellow-50">
              Pending Approvals
            </Button>
          </Link>
          <Button onClick={() => setIsCreateModalOpen(true)}>Create Booking</Button>
        </div>
      </DashboardPageHeader>
      <DashboardPageContainer>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2">Total Bookings</h3>
          <p className="text-3xl font-bold text-blue-600">{total}</p>
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2">Upcoming</h3>
          <p className="text-3xl font-bold text-green-600">{upcomingBookings.length}</p>
        </Card>
        <Card className="p-6 border-l-4 border-l-yellow-400">
          <h3 className="text-lg font-semibold mb-2">Pending Approval</h3>
          <p className="text-3xl font-bold text-yellow-600">{pendingBookings.length}</p>
          {pendingBookings.length > 0 && (
            <Link href="/dashboard/bookings/pending">
              <Button size="sm" variant="outline" className="mt-2 text-yellow-700 border-yellow-300 hover:bg-yellow-50">
                Review Now
              </Button>
            </Link>
          )}
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2">This Month</h3>
          <p className="text-3xl font-bold text-purple-600">
            {bookings.filter(b => 
              new Date(b.startTime).getMonth() === new Date().getMonth()
            ).length}
          </p>
        </Card>
      </div>

      {/* Upcoming Bookings */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Upcoming Bookings</h2>
        {upcomingBookings.length === 0 ? (
          <Card className="p-6 text-center text-gray-500">
            No upcoming bookings
          </Card>
        ) : (
          <div className="space-y-4">
            {upcomingBookings.slice(0, 3).map((booking) => (
              <Card key={booking.id} className="p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {booking.title || booking.meetingType.name}
                    </h3>
                    <p className="text-gray-600 mb-2">
                      {formatDateTime(booking.startTime)} - {formatDateTime(booking.endTime)}
                    </p>
                    <p className="text-sm text-gray-500">
                      with {booking.attendees.map(a => a.name).join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[booking.status as keyof typeof statusColors]}`}>
                      {booking.status}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => handleViewBooking(booking)}>
                      View
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <Card className="p-6 mb-6">
        <h3 className="font-semibold mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Status</label>
            <select
              className="w-full p-2 border rounded-md"
              value={filter.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              title="Filter by booking status"
            >
              <option value="">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Start Date</label>
            <input
              type="date"
              className="w-full p-2 border rounded-md"
              value={filter.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              title="Filter by start date"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">End Date</label>
            <input
              type="date"
              className="w-full p-2 border rounded-md"
              value={filter.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              title="Filter by end date"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Page Size</label>
            <select
              className="w-full p-2 border rounded-md"
              value={limit}
              onChange={(e) => setPageSize(parseInt(e.target.value))}
              title="Number of bookings per page"
            >
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={applyFilters} className="w-full">
              Apply Filters
            </Button>
          </div>
        </div>
      </Card>

      {/* All Bookings */}
      <div>
        <h2 className="text-xl font-semibold mb-4">All Bookings</h2>
        {bookings.length === 0 ? (
          <Card className="p-6 text-center text-gray-500">
            No bookings found
          </Card>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <Card key={booking.id} className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="font-semibold text-lg">
                        {booking.title || booking.meetingType.name}
                      </h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[booking.status as keyof typeof statusColors]}`}>
                        {booking.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                      <div>
                        <p><strong>Time:</strong> {formatDateTime(booking.startTime)} - {formatDateTime(booking.endTime)}</p>
                        <p><strong>Duration:</strong> {booking.meetingType.duration} minutes</p>
                        <p><strong>Location:</strong> {booking.locationType}</p>
                      </div>
                      <div>
                        <p><strong>Attendees:</strong> {booking.attendees.map(a => a.name).join(', ')}</p>
                        <p><strong>Host:</strong> {booking.host.firstName} {booking.host.lastName}</p>
                        {booking.description && <p><strong>Description:</strong> {booking.description}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 ml-4">
                    <Button variant="outline" size="sm" onClick={() => handleViewBooking(booking)}>
                      View
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleEditBooking(booking)}>
                      Edit
                    </Button>
                    {booking.status === 'CONFIRMED' && (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleSyncToCalendar(booking.id)}
                          disabled={syncingBookings.has(booking.id)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          {syncingBookings.has(booking.id) ? 'Syncing...' : 'Sync to Calendar'}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleRemoveFromCalendar(booking.id)}
                          disabled={syncingBookings.has(booking.id)}
                          className="text-orange-600 hover:text-orange-700"
                        >
                          {syncingBookings.has(booking.id) ? 'Removing...' : 'Remove from Calendar'}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleCancelBooking(booking.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {bookings.length > 0 && (
          <div className="flex justify-center items-center space-x-4 mt-6">
            <div className="text-sm text-gray-500 mr-4">
              Total: {total} | Limit: {limit} | Page: {page}
            </div>
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => fetchBookings({ page: page - 1, limit })}
            >
              Previous
            </Button>
            <span className="text-sm text-gray-600">
              Page {page} of {Math.ceil(total / limit)}
            </span>
            <Button
              variant="outline"
              disabled={page >= Math.ceil(total / limit)}
              onClick={() => fetchBookings({ page: page + 1, limit })}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      <CreateBookingModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          setIsCreateModalOpen(false);
          fetchBookings();
        }}
      />

      <ViewBookingModal
        isOpen={isViewModalOpen}
        onClose={handleModalClose}
        booking={selectedBooking}
      />

      <EditBookingModal
        isOpen={isEditModalOpen}
        onClose={handleModalClose}
        booking={selectedBooking}
        onSuccess={handleEditSuccess}
      />
      </DashboardPageContainer>
    </>
  );
}
