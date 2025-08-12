export interface CacheEntry<T> {
  key: string;
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  accessCount: number;
  lastAccessed: number;
  tags: string[];
  priority: 'low' | 'medium' | 'high';
}

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
  memoryUsage: number;
  evictionCount: number;
  avgResponseTime: number;
}

export interface CacheConfig {
  maxMemoryMB: number;
  defaultTTL: number;
  cleanupInterval: number;
  compressionEnabled: boolean;
  persistToDisk: boolean;
  enableMetrics: boolean;
}

export interface QueryCacheEntry {
  query: string;
  queryHash: string;
  analysis: any;
  searchResults: any[];
  response: string;
  sources: any[];
  responseTime: number;
  quality: number; // 0-1 score
}

export interface EmbeddingCacheEntry {
  text: string;
  textHash: string;
  embedding: number[];
  model: string;
  createdAt: string;
}

export interface DocumentCacheEntry {
  filename: string;
  fileHash: string;
  chunks: any[];
  metadata: any;
  processedAt: string;
  summary?: string;
}
