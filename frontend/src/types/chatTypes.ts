export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: {
    sources?: DocumentSource[];
    queryAnalysis?: QueryAnalysis;
    responseTime?: number;
    qualityScore?: number;
    cached?: boolean;
  };
}

export interface DocumentSource {
  filename: string;
  chunkIndex?: number;
  relevanceScore?: number;
  content?: string;
  pageNumber?: number;
}

export interface QueryAnalysis {
  category: string;
  complexity: string;
  confidence: number;
  keywords: string[];
  estimatedResponseTime: number;
  suggestedFollowups: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
  metadata: {
    messageCount: number;
    totalTokens?: number;
    avgResponseTime: number;
    topics: string[];
    bookmarked: boolean;
  };
}

export interface ChatBookmark {
  id: string;
  sessionId: string;
  messageId: string;
  title: string;
  note: string;
  tags: string[];
  created_at: string;
}

export interface SearchResult {
  type: 'message' | 'document' | 'bookmark';
  id: string;
  title: string;
  content: string;
  relevanceScore: number;
  timestamp: string;
  metadata?: Record<string, unknown>; // ✅ FIXED: replaced 'any' with 'unknown'
}

export interface AdvancedSearchFilter {
  query: string;
  dateRange?: {
    start: string;
    end: string;
  };
  messageTypes?: ('user' | 'assistant')[];
  sources?: string[];
  topics?: string[];
  qualityRange?: {
    min: number;
    max: number;
  };
  bookmarkedOnly?: boolean;
  sortBy?: 'relevance' | 'date' | 'quality';
  sortOrder?: 'asc' | 'desc';
}
