export interface DocumentCluster {
  id: string;
  name: string;
  description: string;
  centroid: number[];
  documents: ClusteredDocument[];
  size: number;
  coherenceScore: number;
  topics: string[];
  created_at: string;
  updated_at: string;
}

export interface ClusteredDocument {
  id: string;
  filename: string;
  content: string;
  embedding: number[];
  cluster_id: string;
  similarity_to_centroid: number;
  chunk_index: number;
  metadata: {
    topics: string[];
    keywords: string[];
    summary?: string;
    [key: string]: any;
  };
}

export interface SimilarityResult {
  document: ClusteredDocument;
  similarity: number;
  reason: string;
  sharedTopics: string[];
}

export interface ClusteringMetrics {
  totalClusters: number;
  totalDocuments: number;
  avgClusterSize: number;
  silhouetteScore: number;
  intraClusterDistance: number;
  interClusterDistance: number;
  topicCoverage: number;
}

export interface TopicExtractionResult {
  topics: string[];
  keywords: string[];
  confidence: number;
  summary: string;
}

export interface DocumentSimilarityMatrix {
  documentIds: string[];
  similarities: number[][];
  clusters: number[];
}
