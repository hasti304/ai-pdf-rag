import express from 'express';
import { analyticsService } from '../services/analyticsService.js';
import { trackEvent } from '../middleware/analytics.js';

const router = express.Router();

// Get usage statistics
router.get('/usage', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate query parameter is required'
      });
    }

    const stats = await analyticsService.getUsageStats(
      startDate as string,
      endDate as string
    );

    // Track this API call
    await trackEvent({
      event_type: 'api_call',
      user_id: req.analytics?.userId,
      session_id: req.analytics?.sessionId,
      metadata: {
        endpoint: '/analytics/usage',
        query_params: req.query
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Usage stats error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// Get performance metrics
router.get('/performance', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate query parameter is required'
      });
    }

    const metrics = await analyticsService.getPerformanceMetrics(
      startDate as string,
      endDate as string
    );

    await trackEvent({
      event_type: 'api_call',
      user_id: req.analytics?.userId,
      session_id: req.analytics?.sessionId,
      metadata: {
        endpoint: '/analytics/performance',
        query_params: req.query
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Performance metrics error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// Get time series data for charts
router.get('/timeseries', async (req, res) => {
  try {
    const { startDate, endDate, interval } = req.query;
    
    if (!startDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate query parameter is required'
      });
    }

    const data = await analyticsService.getTimeSeriesData(
      startDate as string,
      endDate as string,
      (interval as 'hour' | 'day') || 'hour'
    );

    await trackEvent({
      event_type: 'api_call',
      user_id: req.analytics?.userId,
      session_id: req.analytics?.sessionId,
      metadata: {
        endpoint: '/analytics/timeseries',
        query_params: req.query
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Time series data error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// Real-time dashboard endpoint
router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      todayStats,
      weeklyStats,
      performanceMetrics,
      timeSeriesData
    ] = await Promise.all([
      analyticsService.getUsageStats(last24Hours),
      analyticsService.getUsageStats(last7Days),
      analyticsService.getPerformanceMetrics(last24Hours),
      analyticsService.getTimeSeriesData(last24Hours, undefined, 'hour')
    ]);

    const dashboardData = {
      today: {
        questions: todayStats.totalQuestions,
        documents: todayStats.totalDocuments,
        users: todayStats.uniqueUsers,
        avgResponseTime: todayStats.avgResponseTime
      },
      week: {
        questions: weeklyStats.totalQuestions,
        documents: weeklyStats.totalDocuments,
        users: weeklyStats.uniqueUsers,
        avgResponseTime: weeklyStats.avgResponseTime
      },
      performance: performanceMetrics,
      charts: {
        timeSeries: timeSeriesData,
        peakHours: todayStats.peakHours,
        popularQueries: todayStats.popularQueries.slice(0, 5),
        documentPopularity: todayStats.documentPopularity.slice(0, 5)
      }
    };

    await trackEvent({
      event_type: 'api_call',
      user_id: req.analytics?.userId,
      session_id: req.analytics?.sessionId,
      metadata: {
        endpoint: '/analytics/dashboard'
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error('Dashboard data error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// Manual trigger for daily stats update
router.post('/update-daily-stats', async (req, res) => {
  try {
    const { date } = req.body;
    await analyticsService.updateDailyStats(date);
    
    res.json({
      success: true,
      message: 'Daily stats updated successfully'
    });
  } catch (error) {
    console.error('Update daily stats error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// Track custom event endpoint
router.post('/track', async (req, res) => {
  try {
    const { eventType, metadata } = req.body;
    
    await trackEvent({
      event_type: eventType,
      user_id: req.analytics?.userId,
      session_id: req.analytics?.sessionId,
      ip_address: req.analytics?.ipAddress,
      user_agent: req.analytics?.userAgent,
      metadata: metadata || {},
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Event tracked successfully'
    });
  } catch (error) {
    console.error('Track event error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

export default router;
