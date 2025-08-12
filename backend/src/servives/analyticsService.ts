import { createClient } from '@supabase/supabase-js';
import { config } from '../shared/config.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

export interface UsageStats {
  totalQuestions: number;
  totalDocuments: number;
  uniqueUsers: number;
  avgResponseTime: number;
  peakHours: { hour: number; count: number }[];
  popularQueries: { query: string; count: number }[];
  documentPopularity: { filename: string; access_count: number }[];
}

export interface PerformanceMetrics {
  avgResponseTime: number;
  errorRate: number;
  throughput: number;
  uptime: number;
  activeUsers: number;
}

export interface TimeSeriesData {
  timestamp: string;
  questions: number;
  uploads: number;
  users: number;
  response_time: number;
}

export class AnalyticsService {
  // Get usage statistics for a date range
  async getUsageStats(
    startDate: string,
    endDate: string = new Date().toISOString()
  ): Promise<UsageStats> {
    try {
      // Get basic counts
      const { data: events, error } = await supabase
        .from('analytics_events')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (error) throw error;

      const questions = events?.filter(e => e.event_type === 'question_asked') || [];
      const uploads = events?.filter(e => e.event_type === 'document_upload') || [];
      const uniqueUsers = new Set(events?.map(e => e.user_id)).size;

      // Calculate average response time
      const responseTimes = questions
        .map(q => q.metadata?.response_time)
        .filter(rt => rt !== undefined && rt !== null);
      const avgResponseTime = responseTimes.length > 0 
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
        : 0;

      // Get peak hours
      const hourCounts = new Map<number, number>();
      questions.forEach(q => {
        const hour = new Date(q.created_at).getHours();
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      });
      const peakHours = Array.from(hourCounts.entries())
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Get popular queries
      const queryCount = new Map<string, number>();
      questions.forEach(q => {
        const query = q.metadata?.question?.toLowerCase().slice(0, 50);
        if (query) {
          queryCount.set(query, (queryCount.get(query) || 0) + 1);
        }
      });
      const popularQueries = Array.from(queryCount.entries())
        .map(([query, count]) => ({ query, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Get document popularity
      const docAccess = new Map<string, number>();
      events?.forEach(e => {
        if (e.metadata?.filename || (e.metadata?.filenames && Array.isArray(e.metadata.filenames))) {
          if (e.metadata.filename) {
            const filename = e.metadata.filename;
            docAccess.set(filename, (docAccess.get(filename) || 0) + 1);
          }
          if (e.metadata.filenames) {
            e.metadata.filenames.forEach((filename: string) => {
              docAccess.set(filename, (docAccess.get(filename) || 0) + 1);
            });
          }
        }
      });
      const documentPopularity = Array.from(docAccess.entries())
        .map(([filename, access_count]) => ({ filename, access_count }))
        .sort((a, b) => b.access_count - a.access_count)
        .slice(0, 10);

      return {
        totalQuestions: questions.length,
        totalDocuments: uploads.length,
        uniqueUsers,
        avgResponseTime,
        peakHours,
        popularQueries,
        documentPopularity
      };
    } catch (error) {
      console.error('Error getting usage stats:', error);
      throw error;
    }
  }

  // Get performance metrics
  async getPerformanceMetrics(
    startDate: string,
    endDate: string = new Date().toISOString()
  ): Promise<PerformanceMetrics> {
    try {
      // Get recent events for calculations
      const { data: events, error: eventsError } = await supabase
        .from('analytics_events')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (eventsError) throw eventsError;

      const totalEvents = events?.length || 0;
      const errorEvents = events?.filter(e => e.event_type === 'error_occurred').length || 0;
      const errorRate = totalEvents > 0 ? (errorEvents / totalEvents) * 100 : 0;

      // Calculate average response time from events
      const responseTimes = events?.filter(e => e.metadata?.response_time)
        .map(e => e.metadata.response_time) || [];
      const avgResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

      // Calculate throughput (requests per minute)
      const timeRangeMinutes = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60);
      const throughput = timeRangeMinutes > 0 ? totalEvents / timeRangeMinutes : 0;

      // Get active users in last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentEvents } = await supabase
        .from('analytics_events')
        .select('user_id')
        .gte('created_at', oneHourAgo);

      const activeUsers = new Set(recentEvents?.map(e => e.user_id)).size;

      return {
        avgResponseTime,
        errorRate,
        throughput,
        uptime: 99.9, // You can implement actual uptime monitoring
        activeUsers
      };
    } catch (error) {
      console.error('Error getting performance metrics:', error);
      throw error;
    }
  }

  // Get time series data for charts
  async getTimeSeriesData(
    startDate: string,
    endDate: string = new Date().toISOString(),
    interval: 'hour' | 'day' = 'hour'
  ): Promise<TimeSeriesData[]> {
    try {
      const { data: events, error } = await supabase
        .from('analytics_events')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Group events by time interval
      const timeGroups = new Map<string, {
        questions: number;
        uploads: number;
        users: Set<string>;
        responseTimes: number[];
      }>();

      events?.forEach(event => {
        const date = new Date(event.created_at);
        const timeKey = interval === 'hour' 
          ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`
          : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

        if (!timeGroups.has(timeKey)) {
          timeGroups.set(timeKey, {
            questions: 0,
            uploads: 0,
            users: new Set(),
            responseTimes: []
          });
        }

        const group = timeGroups.get(timeKey)!;
        
        if (event.event_type === 'question_asked') {
          group.questions++;
          if (event.metadata?.response_time) {
            group.responseTimes.push(event.metadata.response_time);
          }
        } else if (event.event_type === 'document_upload') {
          group.uploads++;
        }
        
        group.users.add(event.user_id);
      });

      // Convert to time series format
      return Array.from(timeGroups.entries()).map(([timeKey, data]) => {
        const avgResponseTime = data.responseTimes.length > 0
          ? data.responseTimes.reduce((a, b) => a + b, 0) / data.responseTimes.length
          : 0;

        return {
          timestamp: timeKey,
          questions: data.questions,
          uploads: data.uploads,
          users: data.users.size,
          response_time: avgResponseTime
        };
      });
    } catch (error) {
      console.error('Error getting time series data:', error);
      throw error;
    }
  }

  // Update daily aggregated stats
  async updateDailyStats(date: string = new Date().toISOString().split('T')[0]): Promise<void> {
    try {
      const { error } = await supabase.rpc('update_daily_stats', { target_date: date });
      if (error) throw error;
    } catch (error) {
      console.error('Error updating daily stats:', error);
      throw error;
    }
  }
}

export const analyticsService = new AnalyticsService();
