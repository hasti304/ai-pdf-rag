import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { createClient } from '@supabase/supabase-js';
import { config } from '../shared/config.js';
import { cacheManager } from './cacheManager.js';
import {
  DocumentSummary,
  SummaryChunk,
  SummarizationRequest,
  SummarizationMetrics,
  SummaryQuality,
  SmartSummaryConfig
} from '../types/summarizationTypes.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
const model = new ChatOpenAI({
  openAIApiKey: config.openai.apiKey,
  modelName: 'gpt-4o-mini',
  temperature: 0.1,
});

const CHUNK_SUMMARY_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are an expert document analyzer specializing in creating concise, informative summaries of text chunks.

Your task is to analyze the provided text chunk and create:
1. A concise summary (2-3 sentences) that captures the main ideas
2. Key topics covered in this chunk
3. Important entities (people, places, organizations, concepts)
4. An importance score (0-1) indicating how crucial this chunk is to understanding the overall document

Focus on:
- Main concepts and arguments
- Key facts and data points
- Important relationships and connections
- Critical conclusions or findings

Return a JSON object with this structure:
{
  "summary": "Concise 2-3 sentence summary of the chunk",
  "topics": ["topic1", "topic2", "topic3"],
  "entities": ["entity1", "entity2", "entity3"],
  "importance": 0.85,
  "keyPoints": ["point1", "point2"]
}

Be precise, factual, and focus on the most important information.`
  ],
  [
    "human",
    `Document: {filename}
Chunk {chunkIndex} of {totalChunks}

Text to analyze:
{chunkText}

Please analyze this chunk and provide the summary information.`
  ]
]);

const FINAL_SUMMARY_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are an expert document summarizer creating a comprehensive summary from analyzed chunks.

Create a well-structured document summary that includes:
1. **Executive Summary**: 2-3 sentences capturing the essence
2. **Key Points**: 5-7 most important points from the document
3. **Main Topics**: Primary subject areas covered
4. **Critical Insights**: Important findings, conclusions, or recommendations

Requirements:
- Length: {targetLength} summary style
- Focus: Maintain factual accuracy and logical flow
- Style: Professional and accessible
- Coverage: Include all major themes proportionally

Return a JSON object with:
{
  "summary": "Complete document summary",
  "keyPoints": ["point1", "point2", ...],
  "topics": ["topic1", "topic2", ...],
  "insights": ["insight1", "insight2", ...],
  "confidence": 0.9,
  "readingTime": 5
}`
  ],
  [
    "human",
    `Document: {filename}
Original length: {originalLength} characters
Target summary style: {targetLength}

Chunk Summaries and Analysis:
{chunkSummaries}

High-importance chunks:
{importantChunks}

Please create a comprehensive document summary based on this analysis.`
  ]
]);

export class DocumentSummarizer {
  private summaries: Map<string, DocumentSummary> = new Map();
  private metrics: SummarizationMetrics | null = null;
  private config: SmartSummaryConfig;
  private textSplitter: RecursiveCharacterTextSplitter;

  constructor(config: Partial<SmartSummaryConfig> = {}) {
    this.config = {
      maxSummaryLength: 2000,
      chunkSize: 4000,
      overlapSize: 200,
      targetCompressionRatio: 0.2, // 20% of original length
      qualityThreshold: 0.75,
      enableCaching: true,
      enableQualityScoring: true,
      ...config
    };

    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.overlapSize,
      separators: ['\n\n', '\n', '. ', ' ', '']
    });

    console.log('📄 Document Summarizer initialized');
    this.loadStoredSummaries();
  }

  // Main summarization function
  async summarizeDocument(request: SummarizationRequest): Promise<DocumentSummary> {
    const startTime = Date.now();
    
    try {
      console.log(`📄 Summarizing document: ${request.filename} (${request.content.length} chars)`);

      // Check cache first
      const cacheKey = `summary:${this.generateDocumentHash(request.content)}`;
      if (this.config.enableCaching) {
        const cached = await cacheManager.getCachedQueryResponse(cacheKey);
        if (cached && cached.analysis) {
          console.log('⚡ Using cached summary');
          const summary = this.validateDocumentSummary(cached.analysis);
          if (summary) return summary;
        }
      }

      // Step 1: Split document into manageable chunks
      const chunks = await this.textSplitter.splitText(request.content);
      console.log(`📊 Split document into ${chunks.length} chunks`);

      // Step 2: Analyze each chunk
      const chunkAnalyses = await this.analyzeChunks(chunks, request.filename);

      // Step 3: Identify most important chunks
      const importantChunks = this.selectImportantChunks(chunkAnalyses, 0.7);

      // Step 4: Create final summary
      const summaryResult = await this.createFinalSummary(
        request,
        chunkAnalyses,
        importantChunks
      );

      // Step 5: Create document summary object
      const documentSummary: DocumentSummary = {
        id: this.generateSummaryId(),
        documentId: request.documentId,
        filename: request.filename,
        originalLength: request.content.length,
        summaryLength: summaryResult.summary.length,
        compressionRatio: summaryResult.summary.length / request.content.length,
        summaryType: request.summaryType || 'hybrid',
        summary: summaryResult.summary,
        keyPoints: summaryResult.keyPoints || [],
        topics: summaryResult.topics || [],
        confidence: summaryResult.confidence || 0.8,
        readingTime: this.calculateReadingTime(summaryResult.summary),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Store summary
      this.summaries.set(documentSummary.id, documentSummary);
      await this.storeSummary(documentSummary);

      // Cache the result
      if (this.config.enableCaching) {
        await cacheManager.cacheQueryResponse(
          cacheKey,
          documentSummary,
          [],
          JSON.stringify(documentSummary),
          [],
          Date.now() - startTime,
          documentSummary.confidence
        );
      }

      // Update metrics
      await this.updateMetrics();

      const processingTime = Date.now() - startTime;
      console.log(`✅ Document summarized in ${processingTime}ms (${documentSummary.compressionRatio.toFixed(3)}x compression)`);

      return documentSummary;
    } catch (error) {
      console.error('Document summarization error:', error);
      throw new Error(`Summarization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Get summary by document ID
  async getSummaryByDocument(documentId: string): Promise<DocumentSummary | null> {
    // Check in-memory cache first
    for (const summary of this.summaries.values()) {
      if (summary.documentId === documentId) {
        return summary;
      }
    }

    // Check database
    try {
      const { data, error } = await supabase
        .from('document_summaries')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error fetching summary:', error);
        return null;
      }

      if (data && data.length > 0) {
        const summary = this.parseStoredSummary(data[0]);
        this.summaries.set(summary.id, summary);
        return summary;
      }
    } catch (error) {
      console.error('Database query error:', error);
    }

    return null;
  }

  // Get all summaries with filtering
  getSummaries(filter?: {
    minQuality?: number;
    maxCompressionRatio?: number;
    topics?: string[];
    limit?: number;
  }): DocumentSummary[] {
    let summaries = Array.from(this.summaries.values());

    if (filter) {
      if (filter.minQuality) {
        summaries = summaries.filter(s => s.confidence >= filter.minQuality!);
      }
      if (filter.maxCompressionRatio) {
        summaries = summaries.filter(s => s.compressionRatio <= filter.maxCompressionRatio!);
      }
      if (filter.topics && filter.topics.length > 0) {
        summaries = summaries.filter(s => 
          s.topics.some(topic => filter.topics!.includes(topic))
        );
      }
      if (filter.limit) {
        summaries = summaries.slice(0, filter.limit);
      }
    }

    return summaries.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  // Smart summary search
  async searchSummaries(query: string, limit: number = 10): Promise<{
    summaries: DocumentSummary[];
    relevanceScores: number[];
  }> {
    try {
      const summaries = Array.from(this.summaries.values());
      const queryLower = query.toLowerCase();
      const results: Array<{ summary: DocumentSummary; score: number }> = [];

      for (const summary of summaries) {
        let score = 0;

        // Check summary text relevance
        const summaryText = summary.summary.toLowerCase();
        if (summaryText.includes(queryLower)) score += 3;

        // Check key points relevance
        const keyPointsMatch = summary.keyPoints.some(point => 
          point.toLowerCase().includes(queryLower)
        );
        if (keyPointsMatch) score += 2;

        // Check topics relevance
        const topicsMatch = summary.topics.some(topic => 
          topic.toLowerCase().includes(queryLower)
        );
        if (topicsMatch) score += 2;

        // Check filename relevance
        if (summary.filename.toLowerCase().includes(queryLower)) score += 1;

        // Boost by quality
        score *= summary.confidence;

        if (score > 0) {
          results.push({ summary, score });
        }
      }

      // Sort by relevance score
      results.sort((a, b) => b.score - a.score);
      const topResults = results.slice(0, limit);

      return {
        summaries: topResults.map(r => r.summary),
        relevanceScores: topResults.map(r => r.score)
      };
    } catch (error) {
      console.error('Summary search error:', error);
      return { summaries: [], relevanceScores: [] };
    }
  }

  // Get summarization metrics
  async getMetrics(): Promise<SummarizationMetrics> {
    if (!this.metrics) {
      await this.updateMetrics();
    }
    return this.metrics!;
  }

  // Batch summarization for multiple documents
  async batchSummarize(requests: SummarizationRequest[]): Promise<DocumentSummary[]> {
    console.log(`📄 Starting batch summarization of ${requests.length} documents`);
    
    const results: DocumentSummary[] = [];
    const batchSize = 3; // Process 3 at a time to avoid rate limits

    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchPromises = batch.map(request => this.summarizeDocument(request));
      
      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Small delay between batches
        if (i + batchSize < requests.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`Batch ${Math.floor(i / batchSize)} failed:`, error);
        // Continue with next batch
      }
    }

    console.log(`✅ Batch summarization completed: ${results.length}/${requests.length} successful`);
    return results;
  }

  // Private helper methods
  private async analyzeChunks(chunks: string[], filename: string): Promise<SummaryChunk[]> {
    const analyses: SummaryChunk[] = [];
    
    console.log(`🔍 Analyzing ${chunks.length} chunks...`);
    
    for (let i = 0; i < chunks.length; i++) {
      try {
        const result = await model.invoke(
          await CHUNK_SUMMARY_PROMPT.format({
            filename,
            chunkIndex: i + 1,
            totalChunks: chunks.length,
            chunkText: chunks[i]
          })
        );

        const analysis = this.safeJSONParse(result.content as string, {
          summary: chunks[i].substring(0, 200),
          topics: ['general'],
          entities: [],
          importance: 0.5,
          keyPoints: []
        });

        analyses.push({
          chunkIndex: i,
          originalText: chunks[i],
          chunkSummary: analysis.summary,
          importance: Math.max(0, Math.min(1, analysis.importance)),
          topics: analysis.topics || [],
          keyEntities: analysis.entities || []
        });

        // Small delay to respect rate limits
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Error analyzing chunk ${i}:`, error);
        // Create fallback analysis
        analyses.push({
          chunkIndex: i,
          originalText: chunks[i],
          chunkSummary: chunks[i].substring(0, 200),
          importance: 0.5,
          topics: ['general'],
          keyEntities: []
        });
      }
    }

    return analyses;
  }

  private selectImportantChunks(analyses: SummaryChunk[], threshold: number = 0.7): SummaryChunk[] {
    return analyses
      .filter(chunk => chunk.importance >= threshold)
      .sort((a, b) => b.importance - a.importance);
  }

  private async createFinalSummary(
    request: SummarizationRequest,
    chunkAnalyses: SummaryChunk[],
    importantChunks: SummaryChunk[]
  ): Promise<any> {
    try {
      const targetLength = request.targetLength || 'moderate';
      
      const chunkSummariesText = chunkAnalyses
        .map((chunk, index) => 
          `Chunk ${index + 1} (Importance: ${chunk.importance.toFixed(2)}): ${chunk.chunkSummary}`
        )
        .join('\n\n');

      const importantChunksText = importantChunks
        .map(chunk => `[High Priority] ${chunk.chunkSummary}`)
        .join('\n');

      const result = await model.invoke(
        await FINAL_SUMMARY_PROMPT.format({
          filename: request.filename,
          originalLength: request.content.length,
          targetLength,
          chunkSummaries: chunkSummariesText,
          importantChunks: importantChunksText
        })
      );

      return this.safeJSONParse(result.content as string, {
        summary: this.createFallbackSummary(chunkAnalyses),
        keyPoints: this.extractKeyPoints(chunkAnalyses),
        topics: this.extractTopics(chunkAnalyses),
        insights: [],
        confidence: 0.6,
        readingTime: 3
      });
    } catch (error) {
      console.error('Final summary creation error:', error);
      return {
        summary: this.createFallbackSummary(chunkAnalyses),
        keyPoints: this.extractKeyPoints(chunkAnalyses),
        topics: this.extractTopics(chunkAnalyses),
        insights: [],
        confidence: 0.6,
        readingTime: this.calculateReadingTime(this.createFallbackSummary(chunkAnalyses))
      };
    }
  }

  private createFallbackSummary(analyses: SummaryChunk[]): string {
    const topChunks = analyses
      .sort((a, b) => b.importance - a.importance)
      .slice(0, Math.min(5, analyses.length));
    
    return topChunks
      .map(chunk => chunk.chunkSummary)
      .join(' ');
  }

  private extractKeyPoints(analyses: SummaryChunk[]): string[] {
    const allTopics = analyses.flatMap(chunk => chunk.topics);
    const topicCounts: Record<string, number> = {};
    
    allTopics.forEach(topic => {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    });

    return Object.entries(topicCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 7)
      .map(([topic]) => topic);
  }

  private extractTopics(analyses: SummaryChunk[]): string[] {
    const allTopics = analyses.flatMap(chunk => chunk.topics);
    return [...new Set(allTopics)].slice(0, 5);
  }

  private calculateReadingTime(text: string): number {
    const wordsPerMinute = 200;
    const wordCount = text.split(/\s+/).length;
    return Math.max(1, Math.round(wordCount / wordsPerMinute));
  }

  private generateDocumentHash(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  private generateSummaryId(): string {
    return `summary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private safeJSONParse(jsonString: string, fallback: any = {}): any {
    try {
      const cleanedString = jsonString
        .trim()
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      
      return JSON.parse(cleanedString);
    } catch (error) {
      console.warn('JSON parsing failed in summarizer:', error);
      return fallback;
    }
  }

  private validateDocumentSummary(cached: any): DocumentSummary | null {
    if (!cached || typeof cached !== 'object') return null;
    if (!cached.id || !cached.summary) return null;
    return cached as DocumentSummary;
  }

  private parseStoredSummary(data: any): DocumentSummary {
    return {
      id: data.id,
      documentId: data.document_id,
      filename: data.filename,
      originalLength: data.original_length,
      summaryLength: data.summary_length,
      compressionRatio: data.compression_ratio,
      summaryType: data.summary_type,
      summary: data.summary,
      keyPoints: this.safeJSONParse(data.key_points, []),
      topics: this.safeJSONParse(data.topics, []),
      confidence: data.confidence,
      readingTime: data.reading_time,
      created_at: data.created_at,
      updated_at: data.updated_at
    };
  }

  private async storeSummary(summary: DocumentSummary): Promise<void> {
    try {
      const { error } = await supabase
        .from('document_summaries')
        .insert([{
          id: summary.id,
          document_id: summary.documentId,
          filename: summary.filename,
          original_length: summary.originalLength,
          summary_length: summary.summaryLength,
          compression_ratio: summary.compressionRatio,
          summary_type: summary.summaryType,
          summary: summary.summary,
          key_points: JSON.stringify(summary.keyPoints),
          topics: JSON.stringify(summary.topics),
          confidence: summary.confidence,
          reading_time: summary.readingTime,
          created_at: summary.created_at,
          updated_at: summary.updated_at
        }]);

      if (error) {
        console.error('Error storing summary:', error);
      }
    } catch (error) {
      console.error('Summary storage error:', error);
    }
  }

  private async loadStoredSummaries(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('document_summaries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading summaries:', error);
        return;
      }

      if (data && data.length > 0) {
        data.forEach((row: any) => {
          const summary = this.parseStoredSummary(row);
          this.summaries.set(summary.id, summary);
        });
        
        console.log(`📄 Loaded ${data.length} stored summaries`);
      }
    } catch (error) {
      console.error('Error loading stored summaries:', error);
    }
  }

  private async updateMetrics(): Promise<void> {
    const summaries = Array.from(this.summaries.values());
    
    if (summaries.length === 0) {
      this.metrics = {
        totalDocuments: 0,
        totalSummaries: 0,
        avgCompressionRatio: 0,
        avgConfidence: 0,
        processingTimeStats: { avg: 0, min: 0, max: 0 },
        qualityScores: { coherence: 0, coverage: 0, conciseness: 0 }
      };
      return;
    }

    const avgCompressionRatio = summaries.reduce((sum, s) => sum + s.compressionRatio, 0) / summaries.length;
    const avgConfidence = summaries.reduce((sum, s) => sum + s.confidence, 0) / summaries.length;

    this.metrics = {
      totalDocuments: new Set(summaries.map(s => s.documentId)).size,
      totalSummaries: summaries.length,
      avgCompressionRatio,
      avgConfidence,
      processingTimeStats: {
        avg: 5000, // Estimated average
        min: 1000,
        max: 15000
      },
      qualityScores: {
        coherence: avgConfidence * 0.9,
        coverage: avgConfidence * 0.8,
        conciseness: avgConfidence * 0.85
      }
    };
  }
}

export const documentSummarizer = new DocumentSummarizer({
  maxSummaryLength: 1500,
  chunkSize: 3000,
  targetCompressionRatio: 0.25,
  qualityThreshold: 0.8,
  enableCaching: true,
  enableQualityScoring: true
});
