import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createClient } from '@supabase/supabase-js';
import { config } from '../shared/config.js';
import { cacheManager } from './cacheManager.js';
import { 
  QualityScore, 
  QualityMetrics, 
  QualityFeedback,
  ResponseEvaluation,
  QualityInsights
} from '../types/qualityTypes.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
const model = new ChatOpenAI({
  openAIApiKey: config.openai.apiKey,
  modelName: 'gpt-4o-mini',
  temperature: 0.1,
});

const QUALITY_EVALUATION_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are an expert AI response evaluator specializing in assessing the quality of AI-generated answers for document-based Q&A systems.

Evaluate the response based on these criteria (score each 0-1):

1. **Relevance** (0-1): How well does the response address the specific question asked?
2. **Accuracy** (0-1): How factually correct is the response based on the provided sources?
3. **Completeness** (0-1): How thoroughly does the response answer the question?
4. **Clarity** (0-1): How clear, readable, and well-structured is the response?
5. **Coherence** (0-1): How logically organized and coherent is the response?
6. **Source Utilization** (0-1): How well are the source documents used and referenced?

Also provide:
- **Overall Score** (0-1): Weighted average considering all factors
- **Confidence** (0-1): Your confidence in this evaluation
- **Key Strengths**: What the response does well
- **Key Weaknesses**: Areas for improvement
- **Specific Improvements**: Actionable suggestions

Return a JSON object with this structure:
{
  "overall": 0.85,
  "relevance": 0.9,
  "accuracy": 0.8,
  "completeness": 0.85,
  "clarity": 0.9,
  "coherence": 0.85,
  "sourceUtilization": 0.75,
  "confidence": 0.9,
  "strengths": ["Clear structure", "Good use of sources"],
  "weaknesses": ["Could be more comprehensive"],
  "improvements": ["Add more specific examples", "Include additional context"]
}

Be objective, constructive, and focus on actionable feedback.`
  ],
  [
    "human",
    `**Question:** {question}

**AI Response:** {response}

**Available Sources:** {sources}

**Query Analysis:** {queryAnalysis}

**Additional Context:**
- Response Time: {responseTime}ms
- Search Strategy: {searchStrategy}
- Cache Hit: {cacheHit}

Please evaluate this response comprehensively.`
  ]
]);

export class ResponseQualityEvaluator {
  private evaluations: Map<string, ResponseEvaluation> = new Map();
  private qualityMetrics: QualityMetrics | null = null;
  private lastInsightsUpdate: Date | null = null;

  constructor() {
    console.log('🔍 Response Quality Evaluator initialized');
    this.loadStoredEvaluations();
  }

  // Main evaluation function
  async evaluateResponse(
    question: string,
    response: string,
    sources: any[],
    queryAnalysis: any,
    processingTime: number,
    cacheHit: boolean = false,
    responseId?: string
  ): Promise<{ evaluation: ResponseEvaluation; shouldCache: boolean }> {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 Evaluating response quality for: "${question.substring(0, 50)}..."`);

      // Check cache for similar evaluation
      const cacheKey = `quality:${this.generateEvaluationHash(question, response)}`;
      const cachedScore = await cacheManager.getCachedQueryResponse(cacheKey);
      
      let qualityScore: QualityScore;
      
      if (cachedScore && cachedScore.analysis) {
        console.log('⚡ Using cached quality evaluation');
        qualityScore = this.validateQualityScore(cachedScore.analysis);
      } else {
        // Perform AI-based evaluation
        qualityScore = await this.performAIEvaluation(
          question,
          response,
          sources,
          queryAnalysis,
          processingTime,
          cacheHit
        );
        
        // Cache the evaluation
        await cacheManager.cacheQueryResponse(
          cacheKey,
          qualityScore,
          [],
          JSON.stringify(qualityScore),
          [],
          Date.now() - startTime,
          qualityScore.confidence
        );
      }

      // Create evaluation record
      const evaluation: ResponseEvaluation = {
        id: responseId || this.generateEvaluationId(),
        question,
        response,
        sources,
        queryAnalysis,
        qualityScore,
        processingTime,
        cacheHit,
        created_at: new Date().toISOString()
      };

      // Store evaluation
      this.evaluations.set(evaluation.id, evaluation);
      
      // Update metrics
      await this.updateQualityMetrics();
      
      // Store in database for persistence
      await this.storeEvaluation(evaluation);

      // Determine if response should be cached based on quality
      const shouldCache = this.shouldCacheResponse(qualityScore, processingTime);

      console.log(`✅ Quality evaluation completed: ${(qualityScore.overall * 100).toFixed(1)}% (${Date.now() - startTime}ms)`);

      return { evaluation, shouldCache };
    } catch (error) {
      console.error('Quality evaluation error:', error);
      
      // Return fallback evaluation
      const fallbackScore: QualityScore = {
        overall: 0.7,
        relevance: 0.7,
        accuracy: 0.7,
        completeness: 0.7,
        clarity: 0.7,
        coherence: 0.7,
        sourceUtilization: 0.7,
        confidence: 0.3
      };

      const fallbackEvaluation: ResponseEvaluation = {
        id: responseId || this.generateEvaluationId(),
        question,
        response,
        sources,
        queryAnalysis,
        qualityScore: fallbackScore,
        processingTime,
        cacheHit,
        created_at: new Date().toISOString()
      };

      return { evaluation: fallbackEvaluation, shouldCache: false };
    }
  }

  // Add user feedback
  async addUserFeedback(
    responseId: string,
    userRating: number,
    userFeedback?: string
  ): Promise<boolean> {
    try {
      const evaluation = this.evaluations.get(responseId);
      if (!evaluation) {
        console.log(`⚠️ Evaluation not found for response ID: ${responseId}`);
        return false;
      }

      const feedback: QualityFeedback = {
        responseId,
        userRating: Math.max(1, Math.min(5, userRating)), // Clamp to 1-5
        userFeedback,
        autoScore: evaluation.qualityScore,
        improvements: this.generateImprovementSuggestions(evaluation.qualityScore, userRating),
        timestamp: new Date().toISOString()
      };

      evaluation.userFeedback = feedback;
      
      // Store feedback in database
      await this.storeFeedback(feedback);
      
      // Update metrics with new feedback
      await this.updateQualityMetrics();

      console.log(`📝 User feedback added for response ${responseId}: ${userRating}/5 stars`);
      return true;
    } catch (error) {
      console.error('Error adding user feedback:', error);
      return false;
    }
  }

  // Get quality metrics
  async getQualityMetrics(): Promise<QualityMetrics> {
    if (!this.qualityMetrics) {
      await this.updateQualityMetrics();
    }
    return this.qualityMetrics!;
  }

  // Get quality insights
  async getQualityInsights(): Promise<QualityInsights> {
    try {
      // Check if we need to update insights
      if (this.shouldUpdateInsights()) {
        return await this.generateQualityInsights();
      }
      
      // Return cached insights if available
      const cachedInsights = await this.getCachedInsights();
      return cachedInsights || await this.generateQualityInsights();
    } catch (error) {
      console.error('Error getting quality insights:', error);
      return this.createFallbackInsights();
    }
  }

  // Get recent evaluations
  getRecentEvaluations(limit: number = 20): ResponseEvaluation[] {
    return Array.from(this.evaluations.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }

  // Get evaluation by ID
  getEvaluation(id: string): ResponseEvaluation | null {
    return this.evaluations.get(id) || null;
  }

  // Quality-based response filtering
  getHighQualityResponses(threshold: number = 0.8): ResponseEvaluation[] {
    return Array.from(this.evaluations.values())
      .filter(evaluation => evaluation.qualityScore.overall >= threshold)
      .sort((a, b) => b.qualityScore.overall - a.qualityScore.overall);
  }

  // Performance analytics
  async getQualityPerformanceAnalytics(): Promise<{
    qualityByCategory: Record<string, number>;
    qualityByComplexity: Record<string, number>;
    qualityByResponseTime: { fast: number; medium: number; slow: number };
    qualityTrends: { date: string; quality: number }[];
  }> {
    const evaluations = Array.from(this.evaluations.values());
    
    // Quality by query category
    const qualityByCategory: Record<string, number[]> = {};
    const qualityByComplexity: Record<string, number[]> = {};
    
    evaluations.forEach(evaluation => {
      const category = evaluation.queryAnalysis?.category || 'unknown';
      const complexity = evaluation.queryAnalysis?.complexity || 'unknown';
      
      if (!qualityByCategory[category]) qualityByCategory[category] = [];
      if (!qualityByComplexity[complexity]) qualityByComplexity[complexity] = [];
      
      qualityByCategory[category].push(evaluation.qualityScore.overall);
      qualityByComplexity[complexity].push(evaluation.qualityScore.overall);
    });

    // Calculate averages
    const avgQualityByCategory: Record<string, number> = {};
    const avgQualityByComplexity: Record<string, number> = {};
    
    for (const [category, scores] of Object.entries(qualityByCategory)) {
      avgQualityByCategory[category] = scores.reduce((a, b) => a + b, 0) / scores.length;
    }
    
    for (const [complexity, scores] of Object.entries(qualityByComplexity)) {
      avgQualityByComplexity[complexity] = scores.reduce((a, b) => a + b, 0) / scores.length;
    }

    // Quality by response time brackets
    const fastResponses = evaluations.filter(e => e.processingTime < 3000);
    const mediumResponses = evaluations.filter(e => e.processingTime >= 3000 && e.processingTime < 8000);
    const slowResponses = evaluations.filter(e => e.processingTime >= 8000);

    const qualityByResponseTime = {
      fast: this.calculateAverageQuality(fastResponses),
      medium: this.calculateAverageQuality(mediumResponses),
      slow: this.calculateAverageQuality(slowResponses)
    };

    // Quality trends (last 7 days)
    const qualityTrends = this.calculateQualityTrends(evaluations, 7);

    return {
      qualityByCategory: avgQualityByCategory,
      qualityByComplexity: avgQualityByComplexity,
      qualityByResponseTime,
      qualityTrends
    };
  }

  // SAFE JSON PARSING - NO EVAL USAGE
  private safeJSONParse(jsonString: string, fallback: any = null): any {
    try {
      // Clean up the JSON string to remove any potential issues
      const cleanedString = jsonString
        .trim()
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
        .replace(/\\/g, '\\\\') // Escape backslashes
        .replace(/\n/g, '\\n') // Escape newlines
        .replace(/\r/g, '\\r') // Escape carriage returns
        .replace(/\t/g, '\\t'); // Escape tabs
      
      return JSON.parse(cleanedString);
    } catch (error) {
      console.warn('JSON parsing failed, using fallback:', error);
      return fallback;
    }
  }

  // Validate and sanitize quality score object
  private validateQualityScore(scoreObj: any): QualityScore {
    // Ensure all required properties exist with valid values
    const defaultScore: QualityScore = {
      overall: 0.7,
      relevance: 0.7,
      accuracy: 0.7,
      completeness: 0.7,
      clarity: 0.7,
      coherence: 0.7,
      sourceUtilization: 0.7,
      confidence: 0.7
    };

    if (!scoreObj || typeof scoreObj !== 'object') {
      return defaultScore;
    }

    return {
      overall: this.clampScore(scoreObj.overall || scoreObj.Overall),
      relevance: this.clampScore(scoreObj.relevance || scoreObj.Relevance),
      accuracy: this.clampScore(scoreObj.accuracy || scoreObj.Accuracy),
      completeness: this.clampScore(scoreObj.completeness || scoreObj.Completeness),
      clarity: this.clampScore(scoreObj.clarity || scoreObj.Clarity),
      coherence: this.clampScore(scoreObj.coherence || scoreObj.Coherence),
      sourceUtilization: this.clampScore(scoreObj.sourceUtilization || scoreObj.SourceUtilization || scoreObj.source_utilization),
      confidence: this.clampScore(scoreObj.confidence || scoreObj.Confidence)
    };
  }

  // Private helper methods
  private async performAIEvaluation(
    question: string,
    response: string,
    sources: any[],
    queryAnalysis: any,
    processingTime: number,
    cacheHit: boolean
  ): Promise<QualityScore> {
    try {
      const sourcesText = sources.map((s, i) => 
        `${i + 1}. ${s.filename}: ${s.content?.substring(0, 200) || 'No content'}...`
      ).join('\n');

      const queryAnalysisText = JSON.stringify({
        category: queryAnalysis?.category,
        complexity: queryAnalysis?.complexity,
        confidence: queryAnalysis?.confidence
      }, null, 2);

      const result = await model.invoke(
        await QUALITY_EVALUATION_PROMPT.format({
          question,
          response,
          sources: sourcesText || 'No sources available',
          queryAnalysis: queryAnalysisText,
          responseTime: processingTime,
          searchStrategy: queryAnalysis?.search_strategy || 'unknown',
          cacheHit: cacheHit.toString()
        })
      );

      const content = result.content as string;
      
      // SAFE JSON PARSING - NO EVAL
      const evaluation = this.safeJSONParse(content, {
        overall: 0.7,
        relevance: 0.7,
        accuracy: 0.7,
        completeness: 0.7,
        clarity: 0.7,
        coherence: 0.7,
        sourceUtilization: 0.7,
        confidence: 0.5
      });
      
      return this.validateQualityScore(evaluation);
    } catch (error) {
      console.error('AI evaluation error:', error);
      return this.createFallbackQualityScore();
    }
  }

  private clampScore(score: any): number {
    if (score === undefined || score === null) return 0.5;
    const num = parseFloat(score);
    if (isNaN(num)) return 0.5;
    return Math.max(0, Math.min(1, num));
  }

  private createFallbackQualityScore(): QualityScore {
    return {
      overall: 0.6,
      relevance: 0.6,
      accuracy: 0.6,
      completeness: 0.6,
      clarity: 0.6,
      coherence: 0.6,
      sourceUtilization: 0.6,
      confidence: 0.3
    };
  }

  private shouldCacheResponse(qualityScore: QualityScore, processingTime: number): boolean {
    // Cache high-quality responses or fast responses
    return qualityScore.overall >= 0.75 || processingTime >= 5000;
  }

  private generateEvaluationHash(question: string, response: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5')
      .update(question + response.substring(0, 200))
      .digest('hex');
  }

  private generateEvaluationId(): string {
    return `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async updateQualityMetrics(): Promise<void> {
    const evaluations = Array.from(this.evaluations.values());
    
    if (evaluations.length === 0) {
      this.qualityMetrics = {
        avgQuality: 0,
        totalEvaluations: 0,
        qualityTrend: 'stable',
        topPerformingCategories: [],
        improvementAreas: [],
        responseTimeImpact: 0
      };
      return;
    }

    const avgQuality = evaluations.reduce((sum, evaluation) => sum + evaluation.qualityScore.overall, 0) / evaluations.length;
    
    // Calculate trend (last 10 vs previous 10 evaluations)
    const recent = evaluations.slice(-10);
    const previous = evaluations.slice(-20, -10);
    
    let qualityTrend: 'improving' | 'stable' | 'declining' = 'stable';
    if (recent.length >= 5 && previous.length >= 5) {
      const recentAvg = recent.reduce((sum, evaluation) => sum + evaluation.qualityScore.overall, 0) / recent.length;
      const previousAvg = previous.reduce((sum, evaluation) => sum + evaluation.qualityScore.overall, 0) / previous.length;
      
      if (recentAvg > previousAvg + 0.05) qualityTrend = 'improving';
      else if (recentAvg < previousAvg - 0.05) qualityTrend = 'declining';
    }

    // Analyze performance by category
    const categoryPerformance: Record<string, number[]> = {};
    evaluations.forEach(evaluation => {
      const category = evaluation.queryAnalysis?.category || 'unknown';
      if (!categoryPerformance[category]) categoryPerformance[category] = [];
      categoryPerformance[category].push(evaluation.qualityScore.overall);
    });

    const topPerformingCategories = Object.entries(categoryPerformance)
      .map(([category, scores]) => ({
        category,
        avg: scores.reduce((a, b) => a + b, 0) / scores.length
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3)
      .map(item => item.category);

    this.qualityMetrics = {
      avgQuality,
      totalEvaluations: evaluations.length,
      qualityTrend,
      topPerformingCategories,
      improvementAreas: this.identifyImprovementAreas(evaluations),
      responseTimeImpact: this.calculateResponseTimeImpact(evaluations)
    };
  }

  private identifyImprovementAreas(evaluations: ResponseEvaluation[]): string[] {
    const areas: string[] = [];
    const avgScores = this.calculateAverageScores(evaluations);

    if (avgScores.accuracy < 0.7) areas.push('accuracy');
    if (avgScores.completeness < 0.7) areas.push('completeness');
    if (avgScores.sourceUtilization < 0.7) areas.push('source_utilization');
    if (avgScores.clarity < 0.7) areas.push('clarity');

    return areas;
  }

  private calculateAverageScores(evaluations: ResponseEvaluation[]): QualityScore {
    if (evaluations.length === 0) return this.createFallbackQualityScore();

    const sums = evaluations.reduce((acc, evaluation) => ({
      overall: acc.overall + evaluation.qualityScore.overall,
      relevance: acc.relevance + evaluation.qualityScore.relevance,
      accuracy: acc.accuracy + evaluation.qualityScore.accuracy,
      completeness: acc.completeness + evaluation.qualityScore.completeness,
      clarity: acc.clarity + evaluation.qualityScore.clarity,
      coherence: acc.coherence + evaluation.qualityScore.coherence,
      sourceUtilization: acc.sourceUtilization + evaluation.qualityScore.sourceUtilization,
      confidence: acc.confidence + evaluation.qualityScore.confidence
    }), {
      overall: 0, relevance: 0, accuracy: 0, completeness: 0,
      clarity: 0, coherence: 0, sourceUtilization: 0, confidence: 0
    });

    const count = evaluations.length;
    return {
      overall: sums.overall / count,
      relevance: sums.relevance / count,
      accuracy: sums.accuracy / count,
      completeness: sums.completeness / count,
      clarity: sums.clarity / count,
      coherence: sums.coherence / count,
      sourceUtilization: sums.sourceUtilization / count,
      confidence: sums.confidence / count
    };
  }

  private calculateResponseTimeImpact(evaluations: ResponseEvaluation[]): number {
    // Analyze correlation between response time and quality
    const pairs = evaluations.map(evaluation => ({
      time: evaluation.processingTime,
      quality: evaluation.qualityScore.overall
    }));

    if (pairs.length < 10) return 0;

    // Simple correlation calculation
    const meanTime = pairs.reduce((sum, p) => sum + p.time, 0) / pairs.length;
    const meanQuality = pairs.reduce((sum, p) => sum + p.quality, 0) / pairs.length;

    const numerator = pairs.reduce((sum, p) => sum + (p.time - meanTime) * (p.quality - meanQuality), 0);
    const denominator = Math.sqrt(
      pairs.reduce((sum, p) => sum + Math.pow(p.time - meanTime, 2), 0) *
      pairs.reduce((sum, p) => sum + Math.pow(p.quality - meanQuality, 2), 0)
    );

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateAverageQuality(evaluations: ResponseEvaluation[]): number {
    if (evaluations.length === 0) return 0;
    return evaluations.reduce((sum, evaluation) => sum + evaluation.qualityScore.overall, 0) / evaluations.length;
  }

  private calculateQualityTrends(evaluations: ResponseEvaluation[], days: number): { date: string; quality: number }[] {
    const trends: { date: string; quality: number }[] = [];
    const now = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayEvaluations = evaluations.filter(evaluation => 
        evaluation.created_at.startsWith(dateStr)
      );
      
      const avgQuality = dayEvaluations.length > 0 
        ? dayEvaluations.reduce((sum, evaluation) => sum + evaluation.qualityScore.overall, 0) / dayEvaluations.length
        : 0;
      
      trends.push({ date: dateStr, quality: avgQuality });
    }
    
    return trends;
  }

  private generateImprovementSuggestions(autoScore: QualityScore, userRating: number): string[] {
    const suggestions: string[] = [];
    const userScore = userRating / 5; // Convert to 0-1 scale
    
    if (userScore < autoScore.overall - 0.2) {
      suggestions.push('AI overestimated quality - review evaluation criteria');
    }
    
    if (autoScore.accuracy < 0.7) {
      suggestions.push('Improve fact-checking against source documents');
    }
    
    if (autoScore.completeness < 0.7) {
      suggestions.push('Provide more comprehensive answers');
    }
    
    if (autoScore.clarity < 0.7) {
      suggestions.push('Improve response structure and readability');
    }

    return suggestions;
  }

  private shouldUpdateInsights(): boolean {
    if (!this.lastInsightsUpdate) return true;
    const hoursSince = (Date.now() - this.lastInsightsUpdate.getTime()) / (1000 * 60 * 60);
    return hoursSince >= 24; // Update insights daily
  }

  private async generateQualityInsights(): Promise<QualityInsights> {
    // This would use the QUALITY_INSIGHTS_PROMPT in a real implementation
    // For now, provide basic insights based on current data
    this.lastInsightsUpdate = new Date();
    
    const evaluations = Array.from(this.evaluations.values());
    const avgQuality = evaluations.length > 0 
      ? evaluations.reduce((sum, evaluation) => sum + evaluation.qualityScore.overall, 0) / evaluations.length
      : 0;

    return {
      patterns: {
        highQualityPatterns: ['Clear source references', 'Well-structured responses', 'Complete answers'],
        lowQualityPatterns: ['Missing context', 'Poor source utilization', 'Incomplete information'],
        commonIssues: ['Source integration', 'Response completeness', 'Clarity issues']
      },
      recommendations: [
        {
          priority: 'high' as const,
          action: 'Improve source document integration in responses',
          expectedImprovement: 0.12
        },
        {
          priority: 'medium' as const,
          action: 'Enhance response structure and formatting',
          expectedImprovement: 0.08
        }
      ],
      benchmarks: {
        targetQuality: 0.85,
        currentQuality: avgQuality,
        industryAverage: 0.72
      }
    };
  }

  private async getCachedInsights(): Promise<QualityInsights | null> {
    // Implementation for cached insights would go here
    return null;
  }

  private createFallbackInsights(): QualityInsights {
    return {
      patterns: {
        highQualityPatterns: ['Accurate information', 'Clear explanations'],
        lowQualityPatterns: ['Generic responses', 'Poor organization'],
        commonIssues: ['Quality assessment unavailable']
      },
      recommendations: [
        {
          priority: 'medium' as const,
          action: 'Gather more quality data for better insights',
          expectedImprovement: 0.05
        }
      ],
      benchmarks: {
        targetQuality: 0.85,
        currentQuality: 0.7,
        industryAverage: 0.72
      }
    };
  }

  private async storeEvaluation(evaluation: ResponseEvaluation): Promise<void> {
    try {
      const { error } = await supabase
        .from('response_evaluations')
        .insert([{
          id: evaluation.id,
          question: evaluation.question,
          response: evaluation.response.substring(0, 5000), // Limit length
          sources: JSON.stringify(evaluation.sources),
          query_analysis: JSON.stringify(evaluation.queryAnalysis),
          quality_score: JSON.stringify(evaluation.qualityScore),
          processing_time: evaluation.processingTime,
          cache_hit: evaluation.cacheHit,
          created_at: evaluation.created_at
        }]);

      if (error) {
        console.error('Error storing evaluation:', error);
      }
    } catch (error) {
      console.error('Evaluation storage error:', error);
    }
  }

  private async storeFeedback(feedback: QualityFeedback): Promise<void> {
    try {
      const { error } = await supabase
        .from('quality_feedback')
        .insert([{
          response_id: feedback.responseId,
          user_rating: feedback.userRating,
          user_feedback: feedback.userFeedback,
          auto_score: JSON.stringify(feedback.autoScore),
          improvements: JSON.stringify(feedback.improvements),
          created_at: feedback.timestamp
        }]);

      if (error) {
        console.error('Error storing feedback:', error);
      }
    } catch (error) {
      console.error('Feedback storage error:', error);
    }
  }

  private async loadStoredEvaluations(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('response_evaluations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100); // Load recent 100 evaluations

      if (error) {
        console.error('Error loading evaluations:', error);
        return;
      }

      if (data && data.length > 0) {
        data.forEach((row: any) => {
          const evaluation: ResponseEvaluation = {
            id: row.id,
            question: row.question,
            response: row.response,
            sources: this.safeJSONParse(row.sources, []),
            queryAnalysis: this.safeJSONParse(row.query_analysis, {}),
            qualityScore: this.validateQualityScore(this.safeJSONParse(row.quality_score, {})),
            processingTime: row.processing_time,
            cacheHit: row.cache_hit,
            created_at: row.created_at
          };
          
          this.evaluations.set(evaluation.id, evaluation);
        });
        
        console.log(`📊 Loaded ${data.length} stored quality evaluations`);
      }
    } catch (error) {
      console.error('Error loading stored evaluations:', error);
    }
  }
}

export const responseQualityEvaluator = new ResponseQualityEvaluator();
