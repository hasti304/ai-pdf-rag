import { createClient } from '@supabase/supabase-js';
import { OpenAIEmbeddings } from '@langchain/openai';
import { config } from './config.js';
import { QueryAnalysis } from '../types/queryTypes.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: config.openai.apiKey,
  modelName: config.openai.embeddingModel,
});

export interface SearchResult {
  pageContent: string;
  metadata: {
    filename: string;
    chunkIndex: number;
    uploadedAt: string;
    [key: string]: any;
  };
  relevanceScore: number;
  searchMethod: string;
  semanticScore?: number;
  keywordScore?: number;
}

export interface SearchMetrics {
  totalResults: number;
  searchTime: number;
  strategy: string;
  semanticWeight: number;
  keywordWeight: number;
  queryOptimization: boolean;
}

export class HybridRetriever {
  private performanceCache: Map<string, SearchMetrics> = new Map();

  async hybridSearch(
    query: string,
    analysisData?: QueryAnalysis,
    k: number = 6
  ): Promise<{ results: SearchResult[]; metrics: SearchMetrics }> {
    const startTime = Date.now();
    
    try {
      // Determine search strategy based on query analysis
      const searchStrategy = this.determineOptimalStrategy(query, analysisData);
      const { semanticWeight, keywordWeight } = this.calculateWeights(analysisData);
      
      console.log(`🔍 Using ${searchStrategy} search strategy (semantic: ${semanticWeight}, keyword: ${keywordWeight})`);

      // Generate embedding for the query
      const queryEmbedding = await embeddings.embedQuery(query);
      
      // Prepare keywords for full-text search
      const keywords = this.optimizeKeywords(query, analysisData);
      
      // Execute hybrid search with proper parameter names
      const { data, error } = await supabase.rpc('adaptive_search', {
        query_embedding: queryEmbedding,
        query_text: keywords,
        searchstrategy: searchStrategy,  // Changed from search_strategy
        match_count: k
      });

      if (error) {
        console.error('Hybrid search error:', error);
        // Fallback to basic semantic search
        return await this.fallbackSearch(query, k);
      }

      // Process and format results with null checks
      const results: SearchResult[] = (data || []).map((row: any) => ({
        pageContent: row.content || '',
        metadata: {
          filename: row.filename || 'unknown_document.pdf',
          chunkIndex: row.chunk_index || 0,
          uploadedAt: row.uploaded_at || new Date().toISOString(),
          ...(row.metadata || {})
        },
        relevanceScore: row.relevance_score || 0,
        searchMethod: row.search_method || 'unknown',
        semanticScore: row.semantic_similarity,
        keywordScore: row.keyword_relevance
      }));

      // Calculate metrics
      const metrics: SearchMetrics = {
        totalResults: results.length,
        searchTime: Date.now() - startTime,
        strategy: searchStrategy,
        semanticWeight,
        keywordWeight,
        queryOptimization: !!analysisData
      };

      // Cache performance metrics
      this.cachePerformanceMetrics(query, metrics);

      return { results, metrics };

    } catch (error) {
      console.error('Hybrid search exception:', error);
      return await this.fallbackSearch(query, k);
    }
  }

  async multiStepSearch(
    query: string,
    analysisData: QueryAnalysis,
    k: number = 8
  ): Promise<{ results: SearchResult[]; metrics: SearchMetrics }> {
    const startTime = Date.now();
    
    try {
      console.log('🔄 Executing multi-step search for complex query');

      // Generate embedding for the query
      const queryEmbedding = await embeddings.embedQuery(query);
      const keywords = this.optimizeKeywords(query, analysisData);

      const { data, error } = await supabase.rpc('adaptive_search', {
        query_embedding: queryEmbedding,
        query_text: keywords,
        searchstrategy: 'multi_step',  // Changed from search_strategy
        match_count: k
      });

      if (error) throw error;

      const results: SearchResult[] = (data || []).map((row: any) => ({
        pageContent: row.content || '',
        metadata: {
          filename: row.filename || 'unknown_document.pdf',
          chunkIndex: row.chunk_index || 0,
          uploadedAt: row.uploaded_at || new Date().toISOString(),
          ...(row.metadata || {})
        },
        relevanceScore: row.relevance_score || 0,
        searchMethod: 'multi_step',
        semanticScore: row.semantic_similarity,
        keywordScore: row.keyword_relevance
      }));

      const metrics: SearchMetrics = {
        totalResults: results.length,
        searchTime: Date.now() - startTime,
        strategy: 'multi_step',
        semanticWeight: 0.6,
        keywordWeight: 0.4,
        queryOptimization: true
      };

      return { results, metrics };

    } catch (error) {
      console.error('Multi-step search error:', error);
      return await this.fallbackSearch(query, k);
    }
  }

  private determineOptimalStrategy(query: string, analysis?: QueryAnalysis): string {
    if (!analysis) return 'hybrid';

    // Use analysis to determine best strategy
    if (analysis.requires_multiple_docs) return 'multi_step';
    if (analysis.complexity === 'complex') return 'hybrid';
    if (analysis.category === 'factual' && analysis.complexity === 'simple') return 'keyword';
    if (analysis.category === 'conceptual') return 'semantic';
    
    return 'hybrid';
  }

  private calculateWeights(analysis?: QueryAnalysis): { semanticWeight: number; keywordWeight: number } {
    if (!analysis) return { semanticWeight: 0.7, keywordWeight: 0.3 };

    switch (analysis.category) {
      case 'factual':
        return { semanticWeight: 0.4, keywordWeight: 0.6 };
      case 'conceptual':
        return { semanticWeight: 0.8, keywordWeight: 0.2 };
      case 'analytical':
        return { semanticWeight: 0.6, keywordWeight: 0.4 };
      case 'comparative':
        return { semanticWeight: 0.7, keywordWeight: 0.3 };
      case 'procedural':
        return { semanticWeight: 0.5, keywordWeight: 0.5 };
      default:
        return { semanticWeight: 0.7, keywordWeight: 0.3 };
    }
  }

  private optimizeKeywords(query: string, analysis?: QueryAnalysis): string {
    let optimizedQuery = query;

    if (analysis?.keywords && analysis.keywords.length > 0) {
      // Add important keywords from analysis
      const additionalKeywords = analysis.keywords
        .filter(keyword => !query.toLowerCase().includes(keyword.toLowerCase()))
        .slice(0, 3);
      
      if (additionalKeywords.length > 0) {
        optimizedQuery += ' ' + additionalKeywords.join(' ');
      }
    }

    // Clean up the query for better full-text search
    return optimizedQuery
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async fallbackSearch(query: string, k: number): Promise<{ results: SearchResult[]; metrics: SearchMetrics }> {
    const startTime = Date.now();
    
    try {
      // Simple semantic search as fallback
      const queryEmbedding = await embeddings.embedQuery(query);
      
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('embedding <=> $1::vector', { ascending: true })
        .limit(k);

      if (error) throw error;

      const results: SearchResult[] = (data || []).map((row: any) => ({
        pageContent: row.content || '',
        metadata: {
          filename: row.filename || 'unknown_document.pdf',
          chunkIndex: row.chunk_index || 0,
          uploadedAt: row.uploaded_at || new Date().toISOString(),
          ...(row.metadata || {})
        },
        relevanceScore: 0.7, // Default relevance
        searchMethod: 'fallback_semantic'
      }));

      const metrics: SearchMetrics = {
        totalResults: results.length,
        searchTime: Date.now() - startTime,
        strategy: 'fallback_semantic',
        semanticWeight: 1.0,
        keywordWeight: 0.0,
        queryOptimization: false
      };

      return { results, metrics };

    } catch (error) {
      console.error('Fallback search failed:', error);
      return {
        results: [],
        metrics: {
          totalResults: 0,
          searchTime: Date.now() - startTime,
          strategy: 'failed',
          semanticWeight: 0,
          keywordWeight: 0,
          queryOptimization: false
        }
      };
    }
  }

  private cachePerformanceMetrics(query: string, metrics: SearchMetrics): void {
    const cacheKey = Buffer.from(query).toString('base64').slice(0, 16);
    this.performanceCache.set(cacheKey, metrics);
    
    // Keep cache size manageable
    if (this.performanceCache.size > 100) {
      const firstKey = this.performanceCache.keys().next().value;
      if (firstKey) {
        this.performanceCache.delete(firstKey);
      }
    }
  }

  getPerformanceMetrics(query?: string): SearchMetrics[] {
    if (query) {
      const cacheKey = Buffer.from(query).toString('base64').slice(0, 16);
      const cached = this.performanceCache.get(cacheKey);
      return cached ? [cached] : [];
    }
    return Array.from(this.performanceCache.values());
  }
}

export const hybridRetriever = new HybridRetriever();
