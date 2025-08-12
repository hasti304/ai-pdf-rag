export interface QualityScore {
  overall: number; // 0-1 overall quality score
  relevance: number; // How relevant to the question
  accuracy: number; // Factual accuracy based on sources
  completeness: number; // How complete the answer is
  clarity: number; // How clear and understandable
  coherence: number; // How well-structured and logical
  sourceUtilization: number; // How well sources were used
  confidence: number; // AI's confidence in the score
}

export interface QualityMetrics {
  avgQuality: number;
  totalEvaluations: number;
  qualityTrend: 'improving' | 'stable' | 'declining';
  topPerformingCategories: string[];
  improvementAreas: string[];
  responseTimeImpact: number;
}

export interface QualityFeedback {
  responseId: string;
  userRating?: number; // 1-5 user rating
  userFeedback?: string;
  autoScore: QualityScore;
  improvements: string[];
  timestamp: string;
}

export interface ResponseEvaluation {
  id: string;
  question: string;
  response: string;
  sources: any[];
  queryAnalysis: any;
  qualityScore: QualityScore;
  processingTime: number;
  cacheHit: boolean;
  userFeedback?: QualityFeedback;
  created_at: string;
}

export interface QualityInsights {
  patterns: {
    highQualityPatterns: string[];
    lowQualityPatterns: string[];
    commonIssues: string[];
  };
  recommendations: {
    priority: 'high' | 'medium' | 'low';
    action: string;
    expectedImprovement: number;
  }[];
  benchmarks: {
    targetQuality: number;
    currentQuality: number;
    industryAverage: number;
  };
}
