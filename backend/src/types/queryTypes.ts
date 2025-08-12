export interface QueryAnalysis {
  category: 'factual' | 'analytical' | 'comparative' | 'procedural' | 'conceptual';
  complexity: 'simple' | 'moderate' | 'complex';
  confidence: number;
  keywords: string[];
  requires_multiple_docs: boolean;
  suggested_followups: string[];
  intent: string;
  domain: string;
  estimated_response_time: number;
}

export interface QueryContext {
  previous_questions: string[];
  session_id: string;
  user_expertise_level?: 'beginner' | 'intermediate' | 'expert';
  document_context?: {
    available_docs: string[];
    relevant_docs: string[];
  };
}

export interface EnhancedQueryResult {
  original_query: string;
  analysis: QueryAnalysis;
  optimized_query: string;
  search_strategy: 'semantic' | 'hybrid' | 'keyword' | 'multi_step';
  processing_metadata: {
    analysis_time: number;
    confidence_threshold: number;
    enhancement_applied: boolean;
  };
}
