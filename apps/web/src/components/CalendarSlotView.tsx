'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react';
import { Button } from './ui/button';

interface TimeSlot {
  startTime: string;
  endTime: string;
  label: string;
  available?: boolean;
  reason?: string | null;
}

interface CalendarSlotViewProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  slots: TimeSlot[];
  selectedSlot?: TimeSlot | null;
  onSlotSelect: (slot: TimeSlot) => void;
  loading?: boolean;
  timezone?: string;
}

export default function CalendarSlotView({
  currentDate,
  onDateChange,
  slots,
  selectedSlot,
  onSlotSelect,
  loading = false,
  timezone = 'UTC'
}: CalendarSlotViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date(currentDate || Date.now()));
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');

  const today = new Date();
  const selectedDate = new Date(currentDate);
  
  // Get days in month
  const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  const startCalendar = new Date(startOfMonth);
  startCalendar.setDate(startCalendar.getDate() - startOfMonth.getDay());
  
  const days = [];
  const current = new Date(startCalendar);
  
  while (current <= endOfMonth || current.getDay() !== 0) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentMonth);
    if (direction === 'prev') {
      newMonth.setMonth(newMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1);
    }
    setCurrentMonth(newMonth);
  };

  const isToday = (date: Date) => {
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date: Date) => {
    return date.toDateString() === selectedDate.toDateString();
  };

  const isPastDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentMonth.getMonth();
  };

  const handleDateClick = (date: Date) => {
    if (isPastDate(date)) return;
    
    const dateStr = date.toISOString().split('T')[0];
    onDateChange(dateStr);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: timezone
    }).format(date);
  };

  const availableSlots = slots.filter(slot => slot.available !== false);

  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Select Date & Time</h3>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <Button
            variant={viewMode === 'calendar' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('calendar')}
            className="rounded-none"
          >
            <Calendar className="w-4 h-4 mr-1" />
            Calendar
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="rounded-none"
          >
            <Clock className="w-4 h-4 mr-1" />
            List
          </Button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <div className="space-y-4">
          {/* Calendar Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateMonth('prev')}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h4 className="text-lg font-medium">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h4>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateMonth('next')}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Week Headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
                {day}
              </div>
            ))}
            
            {/* Calendar Days */}
            {days.map((date, index) => {
              const isPast = isPastDate(date);
              const isCurrent = isCurrentMonth(date);
              const isSelectedDate = isSelected(date);
              const isTodayDate = isToday(date);
              
              return (
                <button
                  key={index}
                  onClick={() => handleDateClick(date)}
                  disabled={isPast}
                  className={`p-2 text-sm rounded-lg transition-colors relative ${
                    isSelectedDate
                      ? 'bg-blue-600 text-white'
                      : isTodayDate
                      ? 'bg-blue-100 text-blue-800 font-medium'
                      : isPast
                      ? 'text-gray-300 cursor-not-allowed'
                      : isCurrent
                      ? 'text-gray-900 hover:bg-gray-100'
                      : 'text-gray-400 hover:bg-gray-50'
                  }`}
                >
                  {date.getDate()}
                  {isTodayDate && (
                    <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-blue-600 rounded-full"></div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <h4 className="font-medium">Quick Date Selection</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Array.from({ length: 7 }, (_, i) => {
              const date = new Date();
              date.setDate(date.getDate() + i);
              const dateStr = date.toISOString().split('T')[0];
              const isSelectedDate = dateStr === currentDate;
              
              return (
                <Button
                  key={i}
                  variant={isSelectedDate ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onDateChange(dateStr)}
                  className="text-left justify-start"
                >
                  <div className="flex flex-col">
                    <span className="text-xs">
                      {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <span className="text-xs opacity-75">
                      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Date Display */}
      {currentDate && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium mb-3">
            Available times for {formatDate(new Date(currentDate))}
          </h4>
          
          {loading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-600">Loading times...</p>
            </div>
          ) : availableSlots.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {availableSlots.map((slot, index) => {
                const isSelected = selectedSlot?.startTime === slot.startTime;
                
                return (
                  <Button
                    key={index}
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onSlotSelect(slot)}
                    className={isSelected ? 'shadow-lg' : ''}
                  >
                    {slot.label}
                  </Button>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">
              No available time slots for this date
            </p>
          )}
        </div>
      )}
    </div>
  );
}
