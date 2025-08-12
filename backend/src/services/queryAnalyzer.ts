import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { config } from '../shared/config.js';
import { QueryAnalysis, QueryContext, EnhancedQueryResult } from '../types/queryTypes.js';

const classificationModel = new ChatOpenAI({
  openAIApiKey: config.openai.apiKey,
  modelName: 'gpt-4o-mini',
  temperature: 0.1,
});

const QUERY_ANALYSIS_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are an expert query analyzer for a document Q&A system. Analyze the user's question and provide a comprehensive JSON response.

Your analysis should include:
1. category: "factual" | "analytical" | "comparative" | "procedural" | "conceptual"
2. complexity: "simple" | "moderate" | "complex"
3. confidence: number (0-1) indicating how well this can be answered from documents
4. keywords: array of key terms for document search
5. requires_multiple_docs: boolean if answer likely needs multiple documents
6. suggested_followups: array of 3-5 relevant follow-up questions
7. intent: brief description of what the user wants to achieve
8. domain: subject area (e.g., "technical", "business", "academic", "legal")
9. estimated_response_time: estimated seconds to generate a good response

Categories explained:
- factual: Direct facts, definitions, specific information
- analytical: Requires analysis, interpretation, insights
- comparative: Comparing options, pros/cons, differences
- procedural: How-to, step-by-step, processes
- conceptual: Understanding concepts, theories, explanations

Consider context and provide actionable insights for optimizing the search and response strategy.

Respond with valid JSON only.`
  ],
  [
    "human",
    `Question: "{question}"
    
    Context: {context}
    
    Previous questions in session: {previous_questions}`
  ]
]);

const QUERY_ENHANCEMENT_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a query optimization expert. Given a user's question and its analysis, create an optimized version that will retrieve better, more relevant information from a document database.

Your task:
1. Preserve the user's original intent
2. Add relevant synonyms and related terms
3. Structure the query for better semantic search
4. Make implicit requirements explicit
5. Add context that helps with document retrieval

Return a JSON object with:
- optimized_query: the enhanced version of the question
- strategy: recommended search strategy ("semantic", "hybrid", "keyword", "multi_step")
- reasoning: brief explanation of optimizations made`
  ],
  [
    "human",
    `Original question: "{original_query}"
    
    Analysis: {analysis}
    
    Available documents context: {doc_context}`
  ]
]);

export class QueryAnalyzer {
  private cache: Map<string, { analysis: QueryAnalysis; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  async analyzeQuery(
    question: string, 
    context: QueryContext = { previous_questions: [], session_id: '' }
  ): Promise<QueryAnalysis> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(question, context);
      const cached = this.getCachedAnalysis(cacheKey);
      if (cached) {
        return cached;
      }

      const contextStr = this.formatContext(context);
      const previousQuestionsStr = context.previous_questions.join(', ') || 'None';

      const response = await classificationModel.invoke(
        await QUERY_ANALYSIS_PROMPT.format({ 
          question,
          context: contextStr,
          previous_questions: previousQuestionsStr
        })
      );
      
      const content = response.content as string;
      let analysis: QueryAnalysis;
      
      try {
        analysis = JSON.parse(content);
      } catch (parseError) {
        console.warn('Failed to parse query analysis JSON, using fallback');
        analysis = this.createFallbackAnalysis(question);
      }

      // Validate and enhance the analysis
      analysis = this.validateAndEnhanceAnalysis(analysis, question);
      
      // Add processing time
      analysis.estimated_response_time = analysis.estimated_response_time || this.estimateResponseTime(analysis);

      // Cache the result
      this.cacheAnalysis(cacheKey, analysis);

      console.log(`🔍 Query analyzed in ${Date.now() - startTime}ms: ${analysis.category} (${analysis.complexity})`);
      return analysis;

    } catch (error) {
      console.error('Query analysis error:', error);
      return this.createFallbackAnalysis(question);
    }
  }

  async enhanceQuery(
    originalQuery: string,
    analysis: QueryAnalysis,
    docContext?: string[]
  ): Promise<EnhancedQueryResult> {
    const startTime = Date.now();
    
    try {
      const docContextStr = docContext?.join(', ') || 'No specific document context available';
      
      const response = await classificationModel.invoke(
        await QUERY_ENHANCEMENT_PROMPT.format({
          original_query: originalQuery,
          analysis: JSON.stringify(analysis, null, 2),
          doc_context: docContextStr
        })
      );

      const content = response.content as string;
      let enhancement;
      
      try {
        enhancement = JSON.parse(content);
      } catch (parseError) {
        console.warn('Failed to parse query enhancement JSON, using original query');
        enhancement = {
          optimized_query: originalQuery,
          strategy: this.determineSearchStrategy(analysis),
          reasoning: 'Fallback: using original query due to parsing error'
        };
      }

      const result: EnhancedQueryResult = {
        original_query: originalQuery,
        analysis,
        optimized_query: enhancement.optimized_query || originalQuery,
        search_strategy: enhancement.strategy || this.determineSearchStrategy(analysis),
        processing_metadata: {
          analysis_time: Date.now() - startTime,
          confidence_threshold: 0.7,
          enhancement_applied: enhancement.optimized_query !== originalQuery
        }
      };

      return result;

    } catch (error) {
      console.error('Query enhancement error:', error);
      return {
        original_query: originalQuery,
        analysis,
        optimized_query: originalQuery,
        search_strategy: this.determineSearchStrategy(analysis),
        processing_metadata: {
          analysis_time: Date.now() - startTime,
          confidence_threshold: 0.7,
          enhancement_applied: false
        }
      };
    }
  }

  generateFollowupQuestions(
    originalQuestion: string, 
    analysis: QueryAnalysis,
    documentContext?: string[]
  ): string[] {
    const followups: string[] = [];
    
    switch (analysis.category) {
      case 'factual':
        followups.push(
          `Can you provide more details about ${analysis.keywords.slice(0, 2).join(' and ')}?`,
          `What are the key characteristics mentioned?`,
          `Are there any specific examples or cases discussed?`
        );
        break;
        
      case 'analytical':
        followups.push(
          `What are the underlying factors that contribute to this?`,
          `How does this compare to industry standards?`,
          `What are the potential implications or consequences?`,
          `What evidence supports this analysis?`
        );
        break;
        
      case 'comparative':
        followups.push(
          `What are the main advantages and disadvantages of each option?`,
          `Which factors are most important when making this comparison?`,
          `What are the cost implications of each approach?`,
          `How do these options perform in different scenarios?`
        );
        break;
        
      case 'procedural':
        followups.push(
          `What are the prerequisites or requirements?`,
          `What tools or resources are needed?`,
          `What are common challenges or pitfalls to avoid?`,
          `How long does this process typically take?`
        );
        break;
        
      case 'conceptual':
        followups.push(
          `Can you explain this concept in simpler terms?`,
          `What are some real-world applications of this concept?`,
          `How does this relate to other similar concepts?`,
          `What are the historical developments in this area?`
        );
        break;
    }

    // Add context-specific followups if document context is available
    if (documentContext && documentContext.length > 0) {
      followups.push(
        `What additional information is available in the uploaded documents?`,
        `Are there related topics covered in the same documents?`
      );
    }

    return followups.slice(0, 5); // Return top 5 followups
  }

  private generateCacheKey(question: string, context: QueryContext): string {
    const contextKey = `${context.session_id}_${context.previous_questions.length}`;
    return Buffer.from(`${question}_${contextKey}`).toString('base64').slice(0, 32);
  }

  private getCachedAnalysis(key: string): QueryAnalysis | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.analysis;
    }
    this.cache.delete(key);
    return null;
  }

  private cacheAnalysis(key: string, analysis: QueryAnalysis): void {
    // Simple cache cleanup to prevent memory leaks
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, {
      analysis,
      timestamp: Date.now()
    });
  }

  private formatContext(context: QueryContext): string {
    const parts = [];
    if (context.user_expertise_level) {
      parts.push(`User expertise: ${context.user_expertise_level}`);
    }
    if (context.document_context?.available_docs.length) {
      parts.push(`Available documents: ${context.document_context.available_docs.length}`);
    }
    return parts.join(', ') || 'No specific context';
  }

  private validateAndEnhanceAnalysis(analysis: QueryAnalysis, question: string): QueryAnalysis {
    // Ensure required fields are present
    analysis.category = analysis.category || 'factual';
    analysis.complexity = analysis.complexity || 'moderate';
    analysis.confidence = Math.min(1, Math.max(0, analysis.confidence || 0.7));
    analysis.keywords = analysis.keywords || this.extractSimpleKeywords(question);
    analysis.requires_multiple_docs = analysis.requires_multiple_docs ?? false;
    analysis.suggested_followups = analysis.suggested_followups || [];
    analysis.intent = analysis.intent || 'User seeks information';
    analysis.domain = analysis.domain || 'general';
    
    return analysis;
  }

  private createFallbackAnalysis(question: string): QueryAnalysis {
    return {
      category: 'factual',
      complexity: 'moderate',
      confidence: 0.7,
      keywords: this.extractSimpleKeywords(question),
      requires_multiple_docs: false,
      suggested_followups: [
        'Can you provide more details about this topic?',
        'What are the key points to consider?',
        'Are there any examples available?'
      ],
      intent: 'User seeks information from documents',
      domain: 'general',
      estimated_response_time: 5
    };
  }

  private extractSimpleKeywords(question: string): string[] {
    // Simple keyword extraction as fallback
    return question
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(' ')
      .filter(word => word.length > 3)
      .filter(word => !['what', 'how', 'why', 'when', 'where', 'which', 'this', 'that', 'they', 'them', 'their'].includes(word))
      .slice(0, 5);
  }

  private determineSearchStrategy(analysis: QueryAnalysis): 'semantic' | 'hybrid' | 'keyword' | 'multi_step' {
    if (analysis.requires_multiple_docs) return 'multi_step';
    if (analysis.complexity === 'complex') return 'hybrid';
    if (analysis.category === 'factual' && analysis.complexity === 'simple') return 'keyword';
    return 'semantic';
  }

  private estimateResponseTime(analysis: QueryAnalysis): number {
    let baseTime = 3; // seconds
    
    if (analysis.complexity === 'complex') baseTime += 2;
    if (analysis.requires_multiple_docs) baseTime += 3;
    if (analysis.category === 'analytical') baseTime += 1;
    
    return baseTime;
  }
}

export const queryAnalyzer = new QueryAnalyzer();
