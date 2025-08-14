export interface DashboardMetrics {
  overview: {
    totalQuestions: number;
    totalDocuments: number;
    avgResponseTime: number;
    cacheHitRate: number;
    qualityScore: number;
  };
  performance: {
    responseTimes: TimeSeriesData[];
    qualityTrends: TimeSeriesData[];
    cachePerformance: CacheMetrics;
    searchStrategies: StrategyMetrics[];
  };
  intelligence: {
    queryCategories: CategoryData[];
    clusteringMetrics: ClusterMetrics;
    summarizationStats: SummarizationStats;
    topTopics: TopicData[];
  };
  realTime: {
    currentLoad: number;
    activeUsers: number;
    recentQueries: RecentQuery[];
    systemHealth: HealthStatus;
  };
}

export interface TimeSeriesData {
  timestamp: string;
  value: number;
  label?: string;
}

export interface CacheMetrics {
  hitRate: number;
  missRate: number;
  totalEntries: number;
  memoryUsage: number;
  avgResponseTime: number;
  recommendations: string[];
}

export interface StrategyMetrics {
  strategy: 'semantic' | 'keyword' | 'hybrid' | 'multi_step';
  usage: number;
  avgQuality: number;
  avgResponseTime: number;
}

export interface CategoryData {
  category: string;
  count: number;
  avgQuality: number;
  avgResponseTime: number;
}

export interface ClusterMetrics {
  totalClusters: number;
  totalDocuments: number;
  avgClusterSize: number;
  silhouetteScore: number;
  topClusters: ClusterInfo[];
}

export interface ClusterInfo {
  id: string;
  name: string;
  size: number;
  topics: string[];
  coherenceScore: number;
}

export interface SummarizationStats {
  totalSummaries: number;
  avgCompressionRatio: number;
  avgConfidence: number;
  processingTime: number;
}

export interface TopicData {
  topic: string;
  frequency: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  growth: number;
}

export interface RecentQuery {
  id: string;
  question: string;
  category: string;
  responseTime: number;
  quality: number;
  timestamp: string;
}

export interface HealthStatus {
  status: 'healthy' | 'warning' | 'critical';
  services: ServiceHealth[];
  uptime: number;
  lastCheck: string;
}

export interface ServiceHealth {
  name: string;
  status: 'online' | 'offline' | 'degraded';
  responseTime: number;
  errorRate: number;
}
