export interface Document {
  id: string;
  filename: string;
  uploadedAt: string;
  size: number;
  status: 'processing' | 'ready' | 'error';
  summary?: DocumentSummary;
  clusterId?: string;
  chunkCount: number;
  tags: string[];
  metadata: {
    author?: string;
    title?: string;
    pageCount?: number;
    language?: string;
    extractedText?: string;
  };
}

export interface DocumentSummary {
  id: string;
  summary: string;
  keyPoints: string[];
  topics: string[];
  confidence: number;
  compressionRatio: number;
  readingTime: number;
}

export interface DocumentCluster {
  id: string;
  name: string;
  description: string;
  size: number;
  documents: Document[];
  topics: string[];
  coherenceScore: number;
  centroid: number[];
  color: string;
  created_at: string;
}

export interface ClusterVisualizationData {
  clusters: ClusterNode[];
  documents: DocumentNode[];
  similarities: SimilarityEdge[];
}

export interface ClusterNode {
  id: string;
  name: string;
  size: number;
  color: string;
  x?: number;
  y?: number;
  topics: string[];
}

export interface DocumentNode {
  id: string;
  filename: string;
  clusterId: string;
  size: number;
  x?: number;
  y?: number;
  color: string;
}

export interface SimilarityEdge {
  source: string;
  target: string;
  similarity: number;
  width: number;
}

export interface DocumentFilter {
  search?: string;
  clusters?: string[];
  tags?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
  status?: ('processing' | 'ready' | 'error')[];
  sortBy?: 'name' | 'date' | 'size' | 'relevance';
  sortOrder?: 'asc' | 'desc';
}

export interface DocumentStats {
  totalDocuments: number;
  totalClusters: number;
  avgClusterSize: number;
  processingQueue: number;
  storageUsed: number;
  lastClusteringRun: string;
}
