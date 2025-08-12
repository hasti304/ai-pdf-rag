export interface DocumentSummary {
  id: string;
  documentId: string;
  filename: string;
  originalLength: number;
  summaryLength: number;
  compressionRatio: number;
  summaryType: 'extractive' | 'abstractive' | 'hybrid';
  summary: string;
  keyPoints: string[];
  topics: string[];
  confidence: number;
  readingTime: number; // in minutes
  created_at: string;
  updated_at: string;
}

export interface SummaryChunk {
  chunkIndex: number;
  originalText: string;
  chunkSummary: string;
  importance: number; // 0-1 score
  topics: string[];
  keyEntities: string[];
}

export interface SummarizationRequest {
  documentId: string;
  filename: string;
  content: string;
  summaryType?: 'extractive' | 'abstractive' | 'hybrid';
  targetLength?: 'brief' | 'moderate' | 'detailed';
  focusAreas?: string[];
}

export interface SummarizationMetrics {
  totalDocuments: number;
  totalSummaries: number;
  avgCompressionRatio: number;
  avgConfidence: number;
  processingTimeStats: {
    avg: number;
    min: number;
    max: number;
  };
  qualityScores: {
    coherence: number;
    coverage: number;
    conciseness: number;
  };
}

export interface SummaryQuality {
  coherence: number; // How well the summary flows
  coverage: number; // How well it covers main points
  conciseness: number; // How efficiently it conveys information
  relevance: number; // How relevant to document content
  readability: number; // How easy to read and understand
  overall: number; // Overall quality score
}

export interface SmartSummaryConfig {
  maxSummaryLength: number;
  chunkSize: number;
  overlapSize: number;
  targetCompressionRatio: number;
  qualityThreshold: number;
  enableCaching: boolean;
  enableQualityScoring: boolean;
}
