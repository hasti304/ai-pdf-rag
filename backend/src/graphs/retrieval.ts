import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { config } from '../shared/config.js';
import { hybridRetriever } from '../shared/hybridRetriever.js';
import { queryAnalyzer } from '../services/queryAnalyzer.js';
import { createClient } from '@supabase/supabase-js';
import { OpenAIEmbeddings } from '@langchain/openai';

// Initialize Supabase and embeddings for basic retrieval
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: config.openai.apiKey,
  modelName: config.openai.embeddingModel,
});

// Initialize the language model
const model = new ChatOpenAI({
  openAIApiKey: config.openai.apiKey,
  modelName: config.openai.model,
  temperature: 0.1,
  streaming: true,
});

// Define types to fix implicit any errors
interface DocumentResult {
  pageContent: string;
  metadata: {
    filename?: string;
    chunkIndex?: number;
    [key: string]: any;
  };
}

// Basic document retrieval function (replaces the missing retriever)
async function getRelevantDocuments(question: string, k: number = 6): Promise<DocumentResult[]> {
  try {
    // Generate embedding for the question
    const questionEmbedding = await embeddings.embedQuery(question);
    
    // Query Supabase for similar documents
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('embedding <=> $1::vector', { ascending: true })
      .limit(k);

    if (error) {
      console.error('Document retrieval error:', error);
      return [];
    }

    // Format results
    return (data || []).map((row: any) => ({
      pageContent: row.content || '',
      metadata: {
        filename: row.filename || 'Unknown',
        chunkIndex: row.chunk_index || 0,
        ...row.metadata
      }
    }));
  } catch (error) {
    console.error('Error retrieving documents:', error);
    return [];
  }
}

// Original simple retrieval function
export async function runRetrievalSimple(question: string) {
  try {
    console.log(`🔍 Simple retrieval for: "${question}"`);
    
    // Get relevant documents using our basic retrieval
    const docs = await getRelevantDocuments(question);
    
    if (docs.length === 0) {
      return { answer: "No relevant documents found for your question.", sources: [] };
    }

    // Format context
    const context = docs
      .map((doc: DocumentResult, index: number) => `Document ${index + 1}:\n${doc.pageContent}`)
      .join('\n\n');

    // Generate response
    const prompt = `Based on the following documents, answer the user's question:

${context}

Question: ${question}

Answer:`;

    const response = await model.invoke(prompt);
    
    return {
      answer: response.content,
      sources: docs.map((doc: DocumentResult) => ({
        pageContent: doc.pageContent.slice(0, 200) + '...',
        metadata: doc.metadata
      }))
    };
  } catch (error) {
    console.error('Simple retrieval error:', error);
    throw error;
  }
}

// Original streaming retrieval function
export async function* runRetrieval(question: string): AsyncGenerator<{ type: string; data: any }> {
  try {
    yield { type: 'status', data: 'Starting document retrieval...' };

    // Get relevant documents using our basic retrieval
    const docs = await getRelevantDocuments(question);
    
    if (docs.length === 0) {
      yield { type: 'error', data: 'No relevant documents found for your question.' };
      return;
    }

    yield { type: 'status', data: `Found ${docs.length} relevant documents. Generating response...` };

    // Format context for LLM
    const context = docs
      .map((doc: DocumentResult, index: number) => `Document ${index + 1}:\n${doc.pageContent}`)
      .join('\n\n');

    // Create prompt
    const prompt = `Based on the following documents, provide a comprehensive answer to the user's question:

${context}

User Question: ${question}

Instructions:
1. Provide a detailed, accurate answer based on the documents
2. Reference specific documents when making claims
3. If information is incomplete, mention what additional details might be helpful

Answer:`;

    // Stream the response
    const stream = await model.stream(prompt);
    
    for await (const chunk of stream) {
      if (chunk.content) {
        yield { type: 'answer_chunk', data: chunk.content };
      }
    }

    // Return sources
    const sources = docs.map((doc: DocumentResult) => ({
      filename: doc.metadata.filename || 'Unknown',
      chunkIndex: doc.metadata.chunkIndex || 0,
      content: doc.pageContent.slice(0, 200) + '...',
      relevanceScore: 0.8 // Default score for basic retrieval
    }));

    yield { type: 'sources', data: sources };
    yield { type: 'complete', data: 'Retrieval completed successfully' };

  } catch (error) {
    console.error('Retrieval error:', error);
    yield { type: 'error', data: `Retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

// Enhanced retrieval with hybrid search
export async function* runEnhancedRetrieval(
  question: string,
  analysisData?: any
): AsyncGenerator<{ type: string; data: any }> {
  try {
    yield { type: 'status', data: 'Starting enhanced retrieval...' };

    // Step 1: Analyze query if not provided
    let queryAnalysis = analysisData;
    if (!queryAnalysis) {
      queryAnalysis = await queryAnalyzer.analyzeQuery(question);
      yield { type: 'analysis', data: queryAnalysis };
    }

    // Step 2: Execute hybrid search
    yield { type: 'status', data: 'Searching documents with hybrid approach...' };
    
    const searchStrategy = queryAnalysis.requires_multiple_docs ? 'multi_step' : 'hybrid';
    const searchResults = searchStrategy === 'multi_step' 
      ? await hybridRetriever.multiStepSearch(question, queryAnalysis, config.retrieval.k)
      : await hybridRetriever.hybridSearch(question, queryAnalysis, config.retrieval.k);

    yield { 
      type: 'search_metrics', 
      data: {
        ...searchResults.metrics,
        resultsFound: searchResults.results.length
      }
    };

    if (searchResults.results.length === 0) {
      yield { type: 'error', data: 'No relevant documents found for your question.' };
      return;
    }

    // Step 3: Format context for LLM
    const context = searchResults.results
      .map((doc: any, index: number) => `Document ${index + 1} (${doc.metadata.filename}, relevance: ${Math.round(doc.relevanceScore * 100)}%):\n${doc.pageContent}`)
      .join('\n\n');

    yield { type: 'status', data: 'Generating AI response...' };

    // Step 4: Generate response with enhanced context
    const enhancedPrompt = `Based on the following documents, provide a comprehensive answer to the user's question.

Query Analysis:
- Category: ${queryAnalysis.category}
- Complexity: ${queryAnalysis.complexity}
- Confidence: ${Math.round(queryAnalysis.confidence * 100)}%

Search Results (using ${searchResults.metrics.strategy} strategy):
${context}

User Question: ${question}

Instructions:
1. Provide a detailed, accurate answer based on the documents
2. If the question is ${queryAnalysis.complexity}, adjust the explanation accordingly
3. Reference specific documents when making claims
4. If information is incomplete, mention what additional details might be helpful

Answer:`;

    // Stream the response
    const stream = await model.stream(enhancedPrompt);
    
    for await (const chunk of stream) {
      if (chunk.content) {
        yield { type: 'answer_chunk', data: chunk.content };
      }
    }

    // Step 5: Return sources with enhanced metadata
    const enhancedSources = searchResults.results.map((doc: any) => ({
      filename: doc.metadata.filename,
      chunkIndex: doc.metadata.chunkIndex,
      content: doc.pageContent.slice(0, 200) + '...',
      relevanceScore: doc.relevanceScore,
      searchMethod: doc.searchMethod,
      semanticScore: doc.semanticScore,
      keywordScore: doc.keywordScore
    }));

    yield { type: 'sources', data: enhancedSources };
    yield { type: 'complete', data: 'Enhanced retrieval completed successfully' };

  } catch (error) {
    console.error('Enhanced retrieval error:', error);
    yield { type: 'error', data: `Enhanced retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}
