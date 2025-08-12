'use client';

import React, { useState, useEffect } from 'react';
import styles from './AnalyticsDashboard.module.css';

interface DashboardData {
  today: {
    questions: number;
    documents: number;
    users: number;
    avgResponseTime: number;
  };
  week: {
    questions: number;
    documents: number;
    users: number;
    avgResponseTime: number;
  };
  performance: {
    avgResponseTime: number;
    errorRate: number;
    throughput: number;
    uptime: number;
    activeUsers: number;
  };
  charts: {
    timeSeries: Array<{
      timestamp: string;
      questions: number;
      uploads: number;
      users: number;
      response_time: number;
    }>;
    peakHours: Array<{ hour: number; count: number }>;
    popularQueries: Array<{ query: string; count: number }>;
    documentPopularity: Array<{ filename: string; access_count: number }>;
  };
}

export default function AnalyticsDashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/analytics/dashboard');
      const result = await response.json();

      if (result.success) {
        setDashboardData(result.data);
        setError(null);
      } else {
        setError(result.error || 'Failed to fetch dashboard data');
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Failed to connect to analytics service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Set up auto-refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  if (loading) {
    return (
      <div className={styles.dashboardContainer}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Loading analytics dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.dashboardContainer}>
        <div className={styles.errorState}>
          <h3>❌ Error Loading Dashboard</h3>
          <p>{error}</p>
          <button onClick={fetchDashboardData} className={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className={styles.dashboardContainer}>
        <div className={styles.errorState}>
          <p>No dashboard data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboardContainer}>
      {/* Header */}
      <div className={styles.dashboardHeader}>
        <h1 className={styles.dashboardTitle}>📊 Analytics Dashboard</h1>
        <div className={styles.headerActions}>
          <button 
            onClick={fetchDashboardData} 
            className={styles.refreshButton}
            title="Refresh dashboard data"
          >
            🔄 Refresh
          </button>
          <div className={styles.lastUpdated}>
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className={styles.metricsGrid}>
        {/* Today's Stats */}
        <div className={styles.metricCard}>
          <div className={styles.cardHeader}>
            <h3>📈 Today&apos;s Activity</h3>
          </div>
          <div className={styles.cardContent}>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Questions Asked:</span>
              <span className={styles.metricValue}>{formatNumber(dashboardData.today.questions)}</span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Documents Uploaded:</span>
              <span className={styles.metricValue}>{formatNumber(dashboardData.today.documents)}</span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Active Users:</span>
              <span className={styles.metricValue}>{formatNumber(dashboardData.today.users)}</span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Avg Response Time:</span>
              <span className={styles.metricValue}>{formatTime(dashboardData.today.avgResponseTime)}</span>
            </div>
          </div>
        </div>

        {/* Weekly Stats */}
        <div className={styles.metricCard}>
          <div className={styles.cardHeader}>
            <h3>📅 This Week</h3>
          </div>
          <div className={styles.cardContent}>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Total Questions:</span>
              <span className={styles.metricValue}>{formatNumber(dashboardData.week.questions)}</span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Total Documents:</span>
              <span className={styles.metricValue}>{formatNumber(dashboardData.week.documents)}</span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Unique Users:</span>
              <span className={styles.metricValue}>{formatNumber(dashboardData.week.users)}</span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Avg Response Time:</span>
              <span className={styles.metricValue}>{formatTime(dashboardData.week.avgResponseTime)}</span>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className={styles.metricCard}>
          <div className={styles.cardHeader}>
            <h3>⚡ Performance</h3>
          </div>
          <div className={styles.cardContent}>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Error Rate:</span>
              <span className={`${styles.metricValue} ${dashboardData.performance.errorRate > 5 ? styles.errorMetric : styles.successMetric}`}>
                {dashboardData.performance.errorRate.toFixed(2)}%
              </span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Throughput:</span>
              <span className={styles.metricValue}>{dashboardData.performance.throughput.toFixed(1)} req/min</span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Uptime:</span>
              <span className={styles.metricValue}>{dashboardData.performance.uptime}%</span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Active Users:</span>
              <span className={styles.metricValue}>{dashboardData.performance.activeUsers}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className={styles.chartsSection}>
        {/* Peak Hours Chart */}
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>🕐 Peak Hours (Today)</h3>
          <div className={styles.barChart}>
            {dashboardData.charts.peakHours.map((hour, index) => {
              const maxCount = Math.max(...dashboardData.charts.peakHours.map(h => h.count), 1);
              const heightPercentage = (hour.count / maxCount) * 100;
              
              return (
                <div key={index} className={styles.barItem}>
                  <div 
                    className={styles.bar}
                    data-height={heightPercentage}
                    title={`${hour.count} questions at ${hour.hour}:00`}
                  ></div>
                  <span className={styles.barLabel}>{hour.hour}:00</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Popular Queries */}
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>🔍 Popular Queries</h3>
          <div className={styles.queryList}>
            {dashboardData.charts.popularQueries.map((query, index) => (
              <div key={index} className={styles.queryItem}>
                <span className={styles.queryText}>
                  {query.query.length > 40 ? query.query.substring(0, 40) + '...' : query.query}
                </span>
                <span className={styles.queryCount}>{query.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Document Popularity */}
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>📄 Document Access</h3>
          <div className={styles.documentList}>
            {dashboardData.charts.documentPopularity.map((doc, index) => (
              <div key={index} className={styles.documentItem}>
                <span className={styles.documentName} title={doc.filename}>
                  {doc.filename.length > 30 ? doc.filename.substring(0, 30) + '...' : doc.filename}
                </span>
                <span className={styles.documentCount}>{doc.access_count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Time Series Chart (Simple implementation) */}
      <div className={styles.fullWidthCard}>
        <h3 className={styles.chartTitle}>📈 Activity Timeline (Last 24 Hours)</h3>
        <div className={styles.timelineChart}>
          {dashboardData.charts.timeSeries.map((point, index) => {
            const maxQuestions = Math.max(...dashboardData.charts.timeSeries.map(p => p.questions), 1);
            const maxUploads = Math.max(...dashboardData.charts.timeSeries.map(p => p.uploads), 1);
            const questionsHeight = (point.questions / maxQuestions) * 60;
            const uploadsHeight = (point.uploads / maxUploads) * 40;
            
            return (
              <div key={index} className={styles.timelinePoint}>
                <div className={styles.timelineBar}>
                  <div 
                    className={styles.questionsBar}
                    data-height={questionsHeight}
                    title={`${point.questions} questions`}
                  ></div>
                  <div 
                    className={styles.uploadsBar}
                    data-height={uploadsHeight}
                    title={`${point.uploads} uploads`}
                  ></div>
                </div>
                <span className={styles.timelineLabel}>
                  {point.timestamp.split('-').slice(-1)[0]}h
                </span>
              </div>
            );
          })}
        </div>
        <div className={styles.chartLegend}>
          <div className={styles.legendItem}>
            <div className={`${styles.legendColor} ${styles.questionsColor}`}></div>
            <span>Questions</span>
          </div>
          <div className={styles.legendItem}>
            <div className={`${styles.legendColor} ${styles.uploadsColor}`}></div>
            <span>Uploads</span>
          </div>
        </div>
      </div>
    </div>
  );
}
