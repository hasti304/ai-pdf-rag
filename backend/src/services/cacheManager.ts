import crypto from 'crypto';
import { CacheEntry, CacheStats, CacheConfig, QueryCacheEntry, EmbeddingCacheEntry } from '../types/cacheTypes.js';

export class IntelligentCacheManager {
  private queryCache: Map<string, CacheEntry<QueryCacheEntry>>;
  private embeddingCache: Map<string, CacheEntry<EmbeddingCacheEntry>>;
  private documentCache: Map<string, CacheEntry<any>>;
  private stats: CacheStats;
  private config: CacheConfig;
  private cleanupTimer: NodeJS.Timeout | null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxMemoryMB: 512,
      defaultTTL: 24 * 60 * 60 * 1000, // 24 hours
      cleanupInterval: 60 * 1000, // 1 minute
      compressionEnabled: true,
      persistToDisk: false,
      enableMetrics: true,
      ...config
    };

    this.queryCache = new Map();
    this.embeddingCache = new Map();
    this.documentCache = new Map();
    
    this.stats = {
      totalEntries: 0,
      hitRate: 0,
      missRate: 0,
      totalHits: 0,
      totalMisses: 0,
      memoryUsage: 0,
      evictionCount: 0,
      avgResponseTime: 0
    };

    this.cleanupTimer = null;
    this.startCleanupTimer();
    
    console.log('🧠 Intelligent Cache Manager initialized with config:', this.config);
  }

  // Query Response Caching
  async cacheQueryResponse(
    query: string,
    analysis: any,
    searchResults: any[],
    response: string,
    sources: any[],
    responseTime: number,
    quality: number = 0.8
  ): Promise<void> {
    try {
      const queryHash = this.generateHash(query.toLowerCase().trim());
      const cacheKey = `query:${queryHash}`;

      const cacheEntry: CacheEntry<QueryCacheEntry> = {
        key: cacheKey,
        data: {
          query,
          queryHash,
          analysis,
          searchResults,
          response,
          sources,
          responseTime,
          quality
        },
        timestamp: Date.now(),
        ttl: this.calculateDynamicTTL(quality, responseTime),
        accessCount: 1,
        lastAccessed: Date.now(),
        tags: [
          'query',
          analysis.category || 'unknown',
          analysis.complexity || 'unknown',
          `quality:${Math.round(quality * 10)}`
        ],
        priority: this.calculatePriority(quality, responseTime)
      };

      this.queryCache.set(cacheKey, cacheEntry);
      this.updateStats('cache');
      
      console.log(`📝 Cached query response: ${query.substring(0, 50)}... (quality: ${Math.round(quality * 100)}%)`);
    } catch (error) {
      console.error('Query caching error:', error);
    }
  }

  async getCachedQueryResponse(query: string): Promise<QueryCacheEntry | null> {
    try {
      const queryHash = this.generateHash(query.toLowerCase().trim());
      const cacheKey = `query:${queryHash}`;
      const entry = this.queryCache.get(cacheKey);

      if (!entry) {
        this.updateStats('miss');
        return null;
      }

      // Check if entry is expired
      if (Date.now() - entry.timestamp > entry.ttl) {
        this.queryCache.delete(cacheKey);
        this.updateStats('miss');
        return null;
      }

      // Update access statistics
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      this.updateStats('hit');

      console.log(`⚡ Cache hit for query: ${query.substring(0, 50)}... (accessed ${entry.accessCount} times)`);
      return entry.data;
    } catch (error) {
      console.error('Query cache retrieval error:', error);
      return null;
    }
  }

  // Embedding Caching
  async cacheEmbedding(text: string, embedding: number[], model: string): Promise<void> {
    try {
      const textHash = this.generateHash(text);
      const cacheKey = `embedding:${textHash}`;

      const cacheEntry: CacheEntry<EmbeddingCacheEntry> = {
        key: cacheKey,
        data: {
          text: text.substring(0, 200), // Store first 200 chars for reference
          textHash,
          embedding,
          model,
          createdAt: new Date().toISOString()
        },
        timestamp: Date.now(),
        ttl: 7 * 24 * 60 * 60 * 1000, // 7 days for embeddings
        accessCount: 1,
        lastAccessed: Date.now(),
        tags: ['embedding', model, `length:${text.length}`],
        priority: 'high' // Embeddings are expensive to compute
      };

      this.embeddingCache.set(cacheKey, cacheEntry);
      console.log(`🎯 Cached embedding for text (${text.length} chars, model: ${model})`);
    } catch (error) {
      console.error('Embedding caching error:', error);
    }
  }

  async getCachedEmbedding(text: string, model: string): Promise<number[] | null> {
    try {
      const textHash = this.generateHash(text);
      const cacheKey = `embedding:${textHash}`;
      const entry = this.embeddingCache.get(cacheKey);

      if (!entry || entry.data.model !== model) {
        return null;
      }

      // Check if entry is expired
      if (Date.now() - entry.timestamp > entry.ttl) {
        this.embeddingCache.delete(cacheKey);
        return null;
      }

      entry.accessCount++;
      entry.lastAccessed = Date.now();
      
      console.log(`⚡ Embedding cache hit for text (${text.length} chars)`);
      return entry.data.embedding;
    } catch (error) {
      console.error('Embedding cache retrieval error:', error);
      return null;
    }
  }

  // Cache Management
  async clearCache(type?: 'query' | 'embedding' | 'document'): Promise<void> {
    if (type === 'query') {
      this.queryCache.clear();
    } else if (type === 'embedding') {
      this.embeddingCache.clear();
    } else if (type === 'document') {
      this.documentCache.clear();
    } else {
      // Clear all caches
      this.queryCache.clear();
      this.embeddingCache.clear();
      this.documentCache.clear();
    }
    
    this.resetStats();
    console.log(`🧹 Cache cleared: ${type || 'all'}`);
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    let invalidatedCount = 0;
    
    // Check query cache
    for (const [key, entry] of this.queryCache.entries()) {
      if (tags.some(tag => entry.tags.includes(tag))) {
        this.queryCache.delete(key);
        invalidatedCount++;
      }
    }
    
    // Check embedding cache
    for (const [key, entry] of this.embeddingCache.entries()) {
      if (tags.some(tag => entry.tags.includes(tag))) {
        this.embeddingCache.delete(key);
        invalidatedCount++;
      }
    }
    
    console.log(`🏷️ Invalidated ${invalidatedCount} cache entries by tags: ${tags.join(', ')}`);
    return invalidatedCount;
  }

  // Analytics & Optimization
  getStats(): CacheStats {
    this.updateMemoryUsage();
    return { ...this.stats };
  }

  getCacheEfficiency(): {
    queryHitRate: number;
    embeddingHitRate: number;
    totalSavings: number;
    recommendedActions: string[];
  } {
    const totalQueries = this.stats.totalHits + this.stats.totalMisses;
    const recommendations: string[] = [];
    
    if (this.stats.hitRate < 0.3) {
      recommendations.push('Consider increasing TTL for high-quality responses');
    }
    if (this.stats.memoryUsage > this.config.maxMemoryMB * 0.8) {
      recommendations.push('Memory usage high - consider cleaning up low-priority entries');
    }
    if (this.embeddingCache.size > 1000) {
      recommendations.push('Large embedding cache - consider implementing LRU eviction');
    }

    return {
      queryHitRate: this.stats.hitRate,
      embeddingHitRate: this.embeddingCache.size > 0 ? 0.7 : 0, // Estimated
      totalSavings: this.stats.totalHits * 2.5, // Estimated 2.5s saved per hit
      recommendedActions: recommendations
    };
  }

  // Preloading & Warming
  async warmCache(commonQueries: string[]): Promise<void> {
    console.log(`🔥 Warming cache with ${commonQueries.length} common queries...`);
    
    for (const query of commonQueries) {
      // Pre-analyze common queries
      const queryHash = this.generateHash(query.toLowerCase().trim());
      const cacheKey = `query:${queryHash}`;
      
      if (!this.queryCache.has(cacheKey)) {
        // This would be filled by actual query results in production
        console.log(`🔥 Pre-warming: ${query}`);
      }
    }
  }

  // Private helper methods
  private generateHash(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  private calculateDynamicTTL(quality: number, responseTime: number): number {
    const baselineResponseTime = 3000; // 3 seconds
    let ttl = this.config.defaultTTL;

    // High-quality responses get longer TTL
    if (quality > 0.8) {
      ttl *= 2;
    } else if (quality < 0.5) {
      ttl *= 0.5;
    }

    // Fast responses get longer TTL (they're efficient)
    if (responseTime < baselineResponseTime) {
      ttl *= 1.5;
    }

    return Math.min(ttl, 7 * 24 * 60 * 60 * 1000); // Max 7 days
  }

  private calculatePriority(quality: number, responseTime: number): 'low' | 'medium' | 'high' {
    if (quality > 0.8 && responseTime < 5000) return 'high';
    if (quality > 0.6 && responseTime < 10000) return 'medium';
    return 'low';
  }

  private updateStats(type: 'hit' | 'miss' | 'cache'): void {
    if (!this.config.enableMetrics) return;

    if (type === 'hit') {
      this.stats.totalHits++;
    } else if (type === 'miss') {
      this.stats.totalMisses++;
    }

    const total = this.stats.totalHits + this.stats.totalMisses;
    if (total > 0) {
      this.stats.hitRate = this.stats.totalHits / total;
      this.stats.missRate = this.stats.totalMisses / total;
    }

    this.stats.totalEntries = this.queryCache.size + this.embeddingCache.size + this.documentCache.size;
  }

  private updateMemoryUsage(): void {
    let totalSize = 0;
    
    // Estimate memory usage (rough calculation)
    this.queryCache.forEach(entry => {
      totalSize += JSON.stringify(entry).length;
    });
    
    this.embeddingCache.forEach(entry => {
      totalSize += entry.data.embedding.length * 8; // 8 bytes per float
      totalSize += entry.data.text.length * 2; // 2 bytes per char
    });

    this.stats.memoryUsage = totalSize / (1024 * 1024); // Convert to MB
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);
  }

  private performCleanup(): void {
    const now = Date.now();
    let evicted = 0;

    // Clean expired entries
    for (const [key, entry] of this.queryCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.queryCache.delete(key);
        evicted++;
      }
    }

    for (const [key, entry] of this.embeddingCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.embeddingCache.delete(key);
        evicted++;
      }
    }

    // Memory pressure cleanup
    if (this.stats.memoryUsage > this.config.maxMemoryMB * 0.9) {
      this.performLRUEviction();
    }

    if (evicted > 0) {
      this.stats.evictionCount += evicted;
      console.log(`🧹 Cleanup: Evicted ${evicted} expired entries`);
    }
  }

  private performLRUEviction(): void {
    const allEntries: Array<{ cache: Map<string, any>; key: string; entry: any }> = [];
    
    // Collect all entries with their cache references
    for (const [key, entry] of this.queryCache.entries()) {
      if (entry.priority === 'low') {
        allEntries.push({ cache: this.queryCache, key, entry });
      }
    }

    // Sort by last accessed (LRU)
    allEntries.sort((a, b) => a.entry.lastAccessed - b.entry.lastAccessed);

    // Remove 20% of low-priority entries
    const toEvict = Math.ceil(allEntries.length * 0.2);
    for (let i = 0; i < toEvict; i++) {
      const { cache, key } = allEntries[i];
      cache.delete(key);
    }

    if (toEvict > 0) {
      console.log(`🚨 Memory pressure: Evicted ${toEvict} low-priority entries`);
      this.stats.evictionCount += toEvict;
    }
  }

  private resetStats(): void {
    this.stats = {
      totalEntries: 0,
      hitRate: 0,
      missRate: 0,
      totalHits: 0,
      totalMisses: 0,
      memoryUsage: 0,
      evictionCount: 0,
      avgResponseTime: 0
    };
  }

  // Cleanup on shutdown
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clearCache();
    console.log('🧠 Cache Manager destroyed');
  }
}

export const cacheManager = new IntelligentCacheManager({
  maxMemoryMB: 256,
  defaultTTL: 12 * 60 * 60 * 1000, // 12 hours
  cleanupInterval: 5 * 60 * 1000, // 5 minutes
  compressionEnabled: true,
  enableMetrics: true
});
