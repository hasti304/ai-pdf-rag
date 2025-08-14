import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { DashboardMetrics } from '../types/dashboardTypes';
import '../styles/dashboard.css';

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00', '#ff00ff'];

interface AdvancedDashboardProps {
  apiEndpoint: string;
  refreshInterval?: number;
}

interface PieChartProps {
  payload?: {
    category: string;
    count: number;
  };
  [key: string]: unknown;
}

const AdvancedDashboard: React.FC<AdvancedDashboardProps> = ({ 
  apiEndpoint, 
  refreshInterval = 30000 // 30 seconds
}) => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'intelligence' | 'realtime'>('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      const response = await fetch(`${apiEndpoint}/analytics/dashboard`);
      if (!response.ok) throw new Error('Failed to fetch dashboard data');
      
      const data = await response.json();
      setMetrics(data.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [apiEndpoint]);

  // Set up auto-refresh
  useEffect(() => {
    fetchDashboardData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchDashboardData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchDashboardData, autoRefresh, refreshInterval]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading advanced analytics...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️ Dashboard Error</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">🤖 AI PDF Chatbot - Advanced Analytics</h1>
            <p className="text-gray-600 mt-2">Real-time insights into your ML-powered system</p>
          </div>
          <div className="flex items-center space-x-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="mr-2"
              />
              Auto-refresh ({refreshInterval / 1000}s)
            </label>
            <button
              onClick={fetchDashboardData}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-6">
        <nav className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
          {[
            { key: 'overview', label: '📊 Overview' },
            { key: 'performance', label: '⚡ Performance' },
            { key: 'intelligence', label: '🧠 Intelligence' },
            { key: 'realtime', label: '📡 Real-time' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as 'overview' | 'performance' | 'intelligence' | 'realtime')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab metrics={metrics} />
      )}
      
      {activeTab === 'performance' && (
        <PerformanceTab metrics={metrics} />
      )}
      
      {activeTab === 'intelligence' && (
        <IntelligenceTab metrics={metrics} />
      )}
      
      {activeTab === 'realtime' && (
        <RealTimeTab metrics={metrics} />
      )}
    </div>
  );
};

// Overview Tab Component
const OverviewTab: React.FC<{ metrics: DashboardMetrics }> = ({ metrics }) => {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <MetricCard
          title="Total Questions"
          value={metrics.overview.totalQuestions.toLocaleString()}
          icon="💬"
          color="blue"
        />
        <MetricCard
          title="Documents"
          value={metrics.overview.totalDocuments.toLocaleString()}
          icon="📄"
          color="green"
        />
        <MetricCard
          title="Avg Response Time"
          value={`${metrics.overview.avgResponseTime.toFixed(1)}s`}
          icon="⚡"
          color="yellow"
        />
        <MetricCard
          title="Cache Hit Rate"
          value={`${(metrics.overview.cacheHitRate * 100).toFixed(1)}%`}
          icon="🎯"
          color="purple"
        />
        <MetricCard
          title="Quality Score"
          value={`${(metrics.overview.qualityScore * 100).toFixed(1)}%`}
          icon="⭐"
          color="indigo"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Response Times Chart */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">📈 Response Times (Last 24h)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics.performance.responseTimes}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Quality Trends Chart */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">⭐ Quality Trends</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={metrics.performance.qualityTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="value" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// Performance Tab Component
const PerformanceTab: React.FC<{ metrics: DashboardMetrics }> = ({ metrics }) => {
  return (
    <div className="space-y-6">
      {/* Cache Performance */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">⚡ Cache Performance</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {(metrics.performance.cachePerformance.hitRate * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">Hit Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {metrics.performance.cachePerformance.totalEntries}
            </div>
            <div className="text-sm text-gray-600">Total Entries</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {metrics.performance.cachePerformance.memoryUsage.toFixed(1)}MB
            </div>
            <div className="text-sm text-gray-600">Memory Usage</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {metrics.performance.cachePerformance.avgResponseTime.toFixed(1)}ms
            </div>
            <div className="text-sm text-gray-600">Avg Response Time</div>
          </div>
        </div>
        
        {/* Cache Recommendations */}
        {metrics.performance.cachePerformance.recommendations.length > 0 && (
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-semibold text-blue-800 mb-2">💡 Optimization Recommendations</h4>
            <ul className="list-disc list-inside space-y-1">
              {metrics.performance.cachePerformance.recommendations.map((rec, recIndex) => (
                <li key={recIndex} className="text-blue-700 text-sm">{rec}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Search Strategies Performance */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">🎯 Search Strategy Performance</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={metrics.performance.searchStrategies}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="strategy" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="usage" fill="#8884d8" name="Usage %" />
            <Bar dataKey="avgQuality" fill="#82ca9d" name="Avg Quality" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Intelligence Tab Component
const IntelligenceTab: React.FC<{ metrics: DashboardMetrics }> = ({ metrics }) => {
  // ✅ FIXED: Properly typed PieChart label function
  const renderPieLabel = (props: PieChartProps) => {
    if (!props.payload) return '';
    const { category, count } = props.payload;
    return `${category}: ${count}`;
  };

  return (
    <div className="space-y-6">
      {/* Query Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">🏷️ Query Categories</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={metrics.intelligence.queryCategories}
                cx="50%"
                cy="50%"
                outerRadius={80}
                fill="#8884d8"
                dataKey="count"
                label={renderPieLabel}
              >
                {metrics.intelligence.queryCategories.map((entry, entryIndex) => (
                  <Cell key={`cell-${entryIndex}`} fill={COLORS[entryIndex % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top Topics */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">🔥 Trending Topics</h3>
          <div className="space-y-3">
            {metrics.intelligence.topTopics.map((topic, topicIndex) => (
              <div key={topicIndex} className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="text-sm font-medium">{topic.topic}</span>
                  <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                    topic.sentiment === 'positive' ? 'bg-green-100 text-green-800' :
                    topic.sentiment === 'negative' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {topic.sentiment}
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="text-sm text-gray-600 mr-2">{topic.frequency}</span>
                  <span className={`text-xs ${topic.growth > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {topic.growth > 0 ? '↗' : '↘'} {Math.abs(topic.growth)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Clustering & Summarization Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">🎯 Document Clustering</h3>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span>Total Clusters:</span>
              <span className="font-semibold">{metrics.intelligence.clusteringMetrics.totalClusters}</span>
            </div>
            <div className="flex justify-between">
              <span>Documents Clustered:</span>
              <span className="font-semibold">{metrics.intelligence.clusteringMetrics.totalDocuments}</span>
            </div>
            <div className="flex justify-between">
              <span>Avg Cluster Size:</span>
              <span className="font-semibold">{metrics.intelligence.clusteringMetrics.avgClusterSize.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span>Silhouette Score:</span>
              <span className="font-semibold">{metrics.intelligence.clusteringMetrics.silhouetteScore.toFixed(3)}</span>
            </div>
          </div>
          
          {/* Top Clusters */}
          <div className="mt-4">
            <h4 className="font-medium mb-2">Top Clusters:</h4>
            <div className="space-y-2">
              {metrics.intelligence.clusteringMetrics.topClusters.map((cluster) => (
                <div key={cluster.id} className="text-sm bg-gray-50 p-2 rounded">
                  <div className="font-medium">{cluster.name} ({cluster.size} docs)</div>
                  <div className="text-gray-600">Topics: {cluster.topics.join(', ')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">📄 Summarization Stats</h3>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span>Total Summaries:</span>
              <span className="font-semibold">{metrics.intelligence.summarizationStats.totalSummaries}</span>
            </div>
            <div className="flex justify-between">
              <span>Avg Compression:</span>
              <span className="font-semibold">{(metrics.intelligence.summarizationStats.avgCompressionRatio * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Avg Confidence:</span>
              <span className="font-semibold">{(metrics.intelligence.summarizationStats.avgConfidence * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Avg Processing Time:</span>
              <span className="font-semibold">{(metrics.intelligence.summarizationStats.processingTime / 1000).toFixed(1)}s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Real-time Tab Component
const RealTimeTab: React.FC<{ metrics: DashboardMetrics }> = ({ metrics }) => {
  // Calculate progress bar class based on load percentage
  const getProgressClass = (load: number): string => {
    const roundedLoad = Math.round(load / 10) * 10;
    return `load-${Math.min(100, Math.max(0, roundedLoad))}`;
  };

  return (
    <div className="space-y-6">
      {/* System Health */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">🏥 System Health</h3>
        <div className="flex items-center mb-4">
          <div className={`status-indicator mr-3 ${
            metrics.realTime.systemHealth.status === 'healthy' ? 'status-healthy' :
            metrics.realTime.systemHealth.status === 'warning' ? 'status-warning' :
            'status-critical'
          }`}></div>
          <span className="font-semibold capitalize">{metrics.realTime.systemHealth.status}</span>
          <span className="ml-auto text-sm text-gray-600">
            Uptime: {(metrics.realTime.systemHealth.uptime / 3600).toFixed(1)}h
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.realTime.systemHealth.services.map((service, serviceIndex) => (
            <div key={serviceIndex} className="bg-gray-50 p-3 rounded">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{service.name}</span>
                <div className={`status-indicator ${
                  service.status === 'online' ? 'status-healthy' :
                  service.status === 'degraded' ? 'status-warning' :
                  'status-critical'
                }`}></div>
              </div>
              <div className="text-xs text-gray-600">
                Response: {service.responseTime}ms
              </div>
              <div className="text-xs text-gray-600">
                Error Rate: {(service.errorRate * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Current Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">📊 Current Activity</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span>Current Load:</span>
              <div className="flex items-center">
                <div className="progress-container">
                  {/* ✅ FIXED: No more inline styles */}
                  <div className={`progress-bar ${getProgressClass(metrics.realTime.currentLoad)}`}></div>
                </div>
                <span className="text-sm font-semibold">{metrics.realTime.currentLoad}%</span>
              </div>
            </div>
            <div className="flex justify-between">
              <span>Active Users:</span>
              <span className="font-semibold">{metrics.realTime.activeUsers}</span>
            </div>
          </div>
        </div>

        {/* Recent Queries */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">💬 Recent Queries</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {metrics.realTime.recentQueries.map((query) => (
              <div key={query.id} className="text-sm border-l-4 border-blue-200 pl-3">
                <div className="font-medium truncate">{query.question}</div>
                <div className="flex justify-between text-gray-600 text-xs mt-1">
                  <span>{query.category}</span>
                  <span>{query.responseTime.toFixed(1)}s</span>
                  <span>Q: {(query.quality * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Metric Card Component
const MetricCard: React.FC<{
  title: string;
  value: string;
  icon: string;
  color: string;
}> = ({ title, value, icon, color }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow metric-card">
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
          <span className="text-2xl">{icon}</span>
        </div>
        <div className="ml-4">
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
};

export default AdvancedDashboard;
