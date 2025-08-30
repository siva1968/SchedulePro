'use client';

import { useState } from 'react';
import { Button } from './ui/button';

interface TimeSlot {
  startTime: string;
  endTime: string;
  label: string;
  available?: boolean;
  reason?: string | null;
}

interface TimeSlotGridProps {
  slots: TimeSlot[];
  selectedSlot?: TimeSlot | null;
  onSlotSelect: (slot: TimeSlot) => void;
  loading?: boolean;
  className?: string;
  suggestions?: Array<{
    date: string;
    availableCount: number;
    firstAvailableSlot: TimeSlot;
    dayName: string;
  }>;
  onDateSuggestionSelect?: (date: string) => void;
}

export default function TimeSlotGrid({
  slots,
  selectedSlot,
  onSlotSelect,
  loading = false,
  className = '',
  suggestions = [],
  onDateSuggestionSelect
}: TimeSlotGridProps) {
  const [showUnavailable, setShowUnavailable] = useState(false);
  
  const availableSlots = slots.filter(slot => slot.available !== false);
  const unavailableSlots = slots.filter(slot => slot.available === false);
  const displaySlots = showUnavailable ? slots : availableSlots;

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600 font-medium">Loading available times...</p>
        <p className="text-sm text-gray-500 mt-1">Please wait while we check availability</p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <div className="flex flex-col items-center">
          <svg className="w-12 h-12 text-yellow-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.728-.833-2.498 0L4.316 15.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h3 className="font-medium text-yellow-800 mb-2">No time slots available</h3>
          <p className="text-sm text-yellow-700 mb-4">There are no available times for this date.</p>
          
          {/* Alternative Date Suggestions */}
          {suggestions.length > 0 && (
            <div className="mt-4 p-4 bg-white rounded-lg border">
              <h4 className="font-medium text-gray-900 mb-3">Alternative dates:</h4>
              <div className="grid grid-cols-1 gap-2">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => onDateSuggestionSelect?.(suggestion.date)}
                    className="p-3 text-left rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-gray-900">
                          {suggestion.dayName}, {new Date(suggestion.date).toLocaleDateString()}
                        </p>
                        <p className="text-sm text-gray-600">
                          {suggestion.availableCount} slots available, starting from {suggestion.firstAvailableSlot.label}
                        </p>
                      </div>
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header with Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4 text-xs text-gray-500">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded mr-2"></div>
            <span>Available ({availableSlots.length})</span>
          </div>
          {unavailableSlots.length > 0 && (
            <div className="flex items-center">
              <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded mr-2"></div>
              <span>Booked ({unavailableSlots.length})</span>
            </div>
          )}
        </div>
        
        {unavailableSlots.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowUnavailable(!showUnavailable)}
            className="text-xs"
          >
            {showUnavailable ? 'Hide' : 'Show'} unavailable slots
          </Button>
        )}
      </div>

      {/* Time Slots Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {displaySlots.map((slot, index) => {
          const isAvailable = slot.available !== false;
          const isSelected = selectedSlot?.startTime === slot.startTime;
          
          return (
            <button
              key={index}
              type="button"
              onClick={() => isAvailable ? onSlotSelect(slot) : null}
              disabled={!isAvailable}
              className={`p-4 text-sm rounded-lg border transition-all duration-200 relative group ${
                isSelected && isAvailable
                  ? 'bg-blue-600 text-white border-blue-600 shadow-lg transform scale-105'
                  : isAvailable
                  ? 'bg-white text-gray-900 border-gray-300 hover:bg-blue-50 hover:border-blue-400 hover:shadow-md'
                  : 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
              }`}
              title={!isAvailable ? (slot.reason === 'BOOKED' ? 'This time slot is already booked' : 'This time slot is not available') : `Click to select ${slot.label}`}
            >
              <div className="flex flex-col items-center">
                <span className="font-semibold">{slot.label}</span>
                <span className="text-xs opacity-75 mt-1">
                  {isAvailable ? 'Available' : 'Booked'}
                </span>
              </div>
              {!isAvailable && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></div>
              )}
              {isSelected && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
              )}
            </button>
          );
        })}
      </div>

      {/* Quick Filters */}
      {availableSlots.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const morningSlots = availableSlots.filter(slot => {
                  const hour = new Date(slot.startTime).getHours();
                  return hour >= 6 && hour < 12;
                });
                if (morningSlots.length > 0) onSlotSelect(morningSlots[0]);
              }}
              className="text-xs"
            >
              First Morning Slot
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const afternoonSlots = availableSlots.filter(slot => {
                  const hour = new Date(slot.startTime).getHours();
                  return hour >= 12 && hour < 17;
                });
                if (afternoonSlots.length > 0) onSlotSelect(afternoonSlots[0]);
              }}
              className="text-xs"
            >
              First Afternoon Slot
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (availableSlots.length > 0) onSlotSelect(availableSlots[0]);
              }}
              className="text-xs"
            >
              Earliest Available
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
