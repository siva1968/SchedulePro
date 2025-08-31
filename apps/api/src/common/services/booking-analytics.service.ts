import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TimezoneUtils } from '../utils/timezone.utils';

export interface BookingAnalytics {
  totalBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  pendingBookings: number;
  conversionRate: number; // confirmed / total
  averageDuration: number; // in minutes
  peakHours: { hour: number; count: number }[];
  peakDays: { day: string; count: number }[];
  busyPeriods: {
    date: string;
    bookingCount: number;
    utilization: number; // percentage of available time booked
  }[];
  noShowRate: number;
  lastMinuteBookings: number; // within 24 hours
  advanceBookings: number; // more than 7 days ahead
}

export interface HostInsights {
  analytics: BookingAnalytics;
  recommendations: string[];
  optimizationSuggestions: {
    type: 'availability' | 'duration' | 'buffer' | 'scheduling';
    message: string;
    impact: 'high' | 'medium' | 'low';
  }[];
  performanceScore: number; // 0-100
}

export interface SystemInsights {
  totalHosts: number;
  activeHosts: number;
  totalBookings: number;
  systemUtilization: number;
  popularMeetingTypes: {
    name: string;
    count: number;
    averageDuration: number;
  }[];
  timezoneDistribution: { timezone: string; count: number }[];
  cancellationReasons: { reason: string; count: number }[];
}

@Injectable()
export class BookingAnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get comprehensive analytics for a specific host
   */
  async getHostAnalytics(
    hostId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<HostInsights> {
    const dateRange = this.getDateRange(startDate, endDate);
    
    // Get all bookings for the host in the date range
    const bookings = await this.prisma.booking.findMany({
      where: {
        hostId,
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end
        }
      },
      include: {
        meetingType: {
          select: { name: true, duration: true }
        }
      },
      orderBy: { startTime: 'asc' }
    });

    // Calculate basic analytics
    const analytics = await this.calculateBasicAnalytics(bookings, hostId, dateRange);
    
    // Generate recommendations and insights
    const recommendations = this.generateRecommendations(analytics, bookings);
    const optimizationSuggestions = await this.generateOptimizationSuggestions(hostId, analytics, bookings);
    const performanceScore = this.calculatePerformanceScore(analytics);

    return {
      analytics,
      recommendations,
      optimizationSuggestions,
      performanceScore
    };
  }

  /**
   * Get system-wide analytics
   */
  async getSystemAnalytics(
    startDate?: Date,
    endDate?: Date
  ): Promise<SystemInsights> {
    const dateRange = this.getDateRange(startDate, endDate);
    
    // Get system statistics
    const [totalHosts, activeHosts, totalBookings] = await Promise.all([
      this.prisma.user.count({
        where: {
          // Assume hosts have at least one meeting type
          meetingTypes: { some: {} }
        }
      }),
      this.prisma.user.count({
        where: {
          hostedBookings: {
            some: {
              createdAt: {
                gte: dateRange.start,
                lte: dateRange.end
              }
            }
          }
        }
      }),
      this.prisma.booking.count({
        where: {
          createdAt: {
            gte: dateRange.start,
            lte: dateRange.end
          }
        }
      })
    ]);

    // Calculate system utilization
    const systemUtilization = await this.calculateSystemUtilization(dateRange);
    
    // Get popular meeting types
    const popularMeetingTypes = await this.getPopularMeetingTypes(dateRange);
    
    // Get timezone distribution
    const timezoneDistribution = await this.getTimezoneDistribution();
    
    // Get cancellation reasons
    const cancellationReasons = await this.getCancellationReasons(dateRange);

    return {
      totalHosts,
      activeHosts,
      totalBookings,
      systemUtilization,
      popularMeetingTypes,
      timezoneDistribution,
      cancellationReasons
    };
  }

  /**
   * Calculate basic booking analytics
   */
  private async calculateBasicAnalytics(
    bookings: any[],
    hostId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<BookingAnalytics> {
    const totalBookings = bookings.length;
    const confirmedBookings = bookings.filter(b => b.status === 'CONFIRMED').length;
    const cancelledBookings = bookings.filter(b => b.status === 'CANCELLED').length;
    const pendingBookings = bookings.filter(b => b.status === 'PENDING').length;
    const conversionRate = totalBookings > 0 ? confirmedBookings / totalBookings : 0;

    // Calculate average duration
    const averageDuration = bookings.length > 0
      ? bookings.reduce((sum, booking) => {
          const duration = (booking.endTime.getTime() - booking.startTime.getTime()) / (1000 * 60);
          return sum + duration;
        }, 0) / bookings.length
      : 0;

    // Calculate peak hours
    const hourCounts = new Map<number, number>();
    bookings.forEach(booking => {
      const hour = booking.startTime.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });
    
    const peakHours = Array.from(hourCounts.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate peak days
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayCounts = new Map<number, number>();
    bookings.forEach(booking => {
      const day = booking.startTime.getDay();
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
    });
    
    const peakDays = Array.from(dayCounts.entries())
      .map(([dayIndex, count]) => ({ day: dayNames[dayIndex], count }))
      .sort((a, b) => b.count - a.count);

    // Calculate busy periods
    const busyPeriods = await this.calculateBusyPeriods(hostId, dateRange);

    // Calculate no-show rate (assuming CANCELLED status for no-shows)
    const noShows = bookings.filter(b => 
      b.status === 'CANCELLED' && 
      b.startTime < new Date() && 
      !b.cancellationReason
    );
    const noShowRate = confirmedBookings > 0 ? noShows.length / confirmedBookings : 0;

    // Calculate booking timing patterns
    const now = new Date();
    const lastMinuteBookings = bookings.filter(b => {
      const hoursAhead = (b.startTime.getTime() - b.createdAt.getTime()) / (1000 * 60 * 60);
      return hoursAhead <= 24;
    }).length;

    const advanceBookings = bookings.filter(b => {
      const daysAhead = (b.startTime.getTime() - b.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysAhead > 7;
    }).length;

    return {
      totalBookings,
      confirmedBookings,
      cancelledBookings,
      pendingBookings,
      conversionRate,
      averageDuration,
      peakHours,
      peakDays,
      busyPeriods,
      noShowRate,
      lastMinuteBookings,
      advanceBookings
    };
  }

  /**
   * Calculate busy periods for a host
   */
  private async calculateBusyPeriods(
    hostId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<{ date: string; bookingCount: number; utilization: number }[]> {
    const busyPeriods: { date: string; bookingCount: number; utilization: number }[] = [];
    
    // Get availability patterns for the host
    const availability = await this.prisma.availability.findMany({
      where: {
        userId: hostId,
        isBlocked: false
      }
    });

    // Group bookings by date
    const bookingsByDate = new Map<string, any[]>();
    const bookings = await this.prisma.booking.findMany({
      where: {
        hostId,
        startTime: {
          gte: dateRange.start,
          lte: dateRange.end
        },
        status: 'CONFIRMED'
      }
    });

    bookings.forEach(booking => {
      const dateKey = booking.startTime.toISOString().split('T')[0];
      if (!bookingsByDate.has(dateKey)) {
        bookingsByDate.set(dateKey, []);
      }
      bookingsByDate.get(dateKey)!.push(booking);
    });

    // Calculate utilization for each day
    for (const [date, dayBookings] of bookingsByDate) {
      const totalBookedMinutes = dayBookings.reduce((sum, booking) => {
        return sum + (booking.endTime.getTime() - booking.startTime.getTime()) / (1000 * 60);
      }, 0);

      // Calculate available minutes for this date
      const dayOfWeek = new Date(date).getDay();
      const dayAvailability = availability.filter(a => 
        a.type === 'RECURRING' && a.dayOfWeek === dayOfWeek
      );

      const totalAvailableMinutes = dayAvailability.reduce((sum, avail) => {
        const start = new Date(`${date}T${avail.startTime}`);
        const end = new Date(`${date}T${avail.endTime}`);
        return sum + (end.getTime() - start.getTime()) / (1000 * 60);
      }, 0);

      const utilization = totalAvailableMinutes > 0 ? totalBookedMinutes / totalAvailableMinutes : 0;

      busyPeriods.push({
        date,
        bookingCount: dayBookings.length,
        utilization: Math.min(1, utilization) // Cap at 100%
      });
    }

    return busyPeriods.sort((a, b) => b.utilization - a.utilization).slice(0, 10);
  }

  /**
   * Generate recommendations based on analytics
   */
  private generateRecommendations(analytics: BookingAnalytics, bookings: any[]): string[] {
    const recommendations: string[] = [];

    // Conversion rate recommendations
    if (analytics.conversionRate < 0.8) {
      recommendations.push('Consider improving your booking confirmation process - your conversion rate could be higher');
    }

    // No-show recommendations
    if (analytics.noShowRate > 0.1) {
      recommendations.push('High no-show rate detected - consider implementing confirmation reminders');
    }

    // Peak hour recommendations
    if (analytics.peakHours.length > 0) {
      const topHour = analytics.peakHours[0];
      recommendations.push(`Your busiest hour is ${topHour.hour}:00 - consider adding more availability around this time`);
    }

    // Last minute booking recommendations
    if (analytics.lastMinuteBookings > analytics.totalBookings * 0.3) {
      recommendations.push('Many bookings are last-minute - consider setting minimum advance notice requirements');
    }

    // Utilization recommendations
    const avgUtilization = analytics.busyPeriods.reduce((sum, period) => sum + period.utilization, 0) / analytics.busyPeriods.length;
    if (avgUtilization < 0.3) {
      recommendations.push('Low booking utilization - consider reducing available hours or improving marketing');
    } else if (avgUtilization > 0.8) {
      recommendations.push('High utilization detected - consider adding more availability to meet demand');
    }

    return recommendations;
  }

  /**
   * Generate optimization suggestions
   */
  private async generateOptimizationSuggestions(
    hostId: string,
    analytics: BookingAnalytics,
    bookings: any[]
  ): Promise<{ type: 'availability' | 'duration' | 'buffer' | 'scheduling'; message: string; impact: 'high' | 'medium' | 'low' }[]> {
    const suggestions = [];

    // Availability optimization
    if (analytics.peakHours.length > 0) {
      const topHour = analytics.peakHours[0];
      suggestions.push({
        type: 'availability' as const,
        message: `Add more availability slots around ${topHour.hour}:00 when demand is highest`,
        impact: 'high' as const
      });
    }

    // Duration optimization
    if (analytics.averageDuration > 0) {
      const shortBookings = bookings.filter(b => {
        const duration = (b.endTime.getTime() - b.startTime.getTime()) / (1000 * 60);
        return duration < analytics.averageDuration * 0.7;
      });

      if (shortBookings.length > bookings.length * 0.3) {
        suggestions.push({
          type: 'duration' as const,
          message: 'Consider offering shorter meeting options - many sessions finish early',
          impact: 'medium' as const
        });
      }
    }

    // Buffer time optimization
    const consecutiveBookings = this.findConsecutiveBookings(bookings);
    if (consecutiveBookings.length > 0) {
      suggestions.push({
        type: 'buffer' as const,
        message: 'Add buffer time between consecutive bookings to reduce stress and improve quality',
        impact: 'medium' as const
      });
    }

    // Scheduling pattern optimization
    const weekendBookings = bookings.filter(b => {
      const day = b.startTime.getDay();
      return day === 0 || day === 6; // Sunday or Saturday
    });

    if (weekendBookings.length < bookings.length * 0.1) {
      suggestions.push({
        type: 'scheduling' as const,
        message: 'Consider adding weekend availability to capture more bookings',
        impact: 'low' as const
      });
    }

    return suggestions;
  }

  /**
   * Calculate performance score (0-100)
   */
  private calculatePerformanceScore(analytics: BookingAnalytics): number {
    let score = 0;

    // Conversion rate (30 points)
    score += analytics.conversionRate * 30;

    // Low no-show rate (20 points)
    score += Math.max(0, (1 - analytics.noShowRate) * 20);

    // Good utilization (25 points)
    const avgUtilization = analytics.busyPeriods.reduce((sum, period) => sum + period.utilization, 0) / analytics.busyPeriods.length || 0;
    if (avgUtilization >= 0.4 && avgUtilization <= 0.8) {
      score += 25;
    } else {
      score += Math.max(0, 25 - Math.abs(0.6 - avgUtilization) * 50);
    }

    // Booking volume (15 points)
    if (analytics.totalBookings > 20) {
      score += 15;
    } else {
      score += (analytics.totalBookings / 20) * 15;
    }

    // Balanced scheduling (10 points)
    const isBalanced = analytics.peakDays.length > 0 && 
      analytics.peakDays[0].count / analytics.totalBookings < 0.5;
    if (isBalanced) {
      score += 10;
    }

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Helper methods
   */
  private getDateRange(startDate?: Date, endDate?: Date): { start: Date; end: Date } {
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    return { start, end };
  }

  private findConsecutiveBookings(bookings: any[]): any[] {
    const consecutive = [];
    const sortedBookings = bookings.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    
    for (let i = 0; i < sortedBookings.length - 1; i++) {
      const current = sortedBookings[i];
      const next = sortedBookings[i + 1];
      
      if (current.endTime.getTime() === next.startTime.getTime()) {
        consecutive.push([current, next]);
      }
    }
    
    return consecutive;
  }

  private async calculateSystemUtilization(dateRange: { start: Date; end: Date }): Promise<number> {
    // Simplified calculation - could be more sophisticated
    const totalBookings = await this.prisma.booking.count({
      where: {
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end
        },
        status: 'CONFIRMED'
      }
    });

    const totalHosts = await this.prisma.user.count({
      where: { meetingTypes: { some: {} } }
    });

    // Rough estimation: assume 8 hours per day per host
    const daysInRange = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
    const totalPossibleHours = totalHosts * daysInRange * 8;
    const averageBookingHours = 1; // Assume 1 hour average
    const totalBookedHours = totalBookings * averageBookingHours;

    return totalPossibleHours > 0 ? Math.min(1, totalBookedHours / totalPossibleHours) : 0;
  }

  private async getPopularMeetingTypes(dateRange: { start: Date; end: Date }) {
    const result = await this.prisma.booking.groupBy({
      by: ['meetingTypeId'],
      where: {
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end
        }
      },
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: 10
    });

    // Get meeting type details
    const meetingTypeIds = result.map(r => r.meetingTypeId);
    const meetingTypes = await this.prisma.meetingType.findMany({
      where: { id: { in: meetingTypeIds } },
      select: { id: true, name: true, duration: true }
    });

    return result.map(r => {
      const meetingType = meetingTypes.find(mt => mt.id === r.meetingTypeId);
      return {
        name: meetingType?.name || 'Unknown',
        count: r._count.id,
        averageDuration: meetingType?.duration || 0
      };
    });
  }

  private async getTimezoneDistribution() {
    const result = await this.prisma.user.groupBy({
      by: ['timezone'],
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    });

    return result.map(r => ({
      timezone: r.timezone || 'Unknown',
      count: r._count.id
    }));
  }

  private async getCancellationReasons(dateRange: { start: Date; end: Date }) {
    const cancelledBookings = await this.prisma.booking.findMany({
      where: {
        status: 'CANCELLED',
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end
        },
        notes: {
          not: null
        }
      },
      select: { notes: true }
    });

    const reasonCounts = new Map<string, number>();
    cancelledBookings.forEach(booking => {
      const reason = booking.notes || 'No reason provided';
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    });

    return Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }
}
