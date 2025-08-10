import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import { supabase } from './supabase.js';
import { config } from './config.js';

// Initialize OpenAI embeddings
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: config.openai.apiKey,
  modelName: config.openai.embeddingModel,
});

// Initialize vector store
const vectorStore = new SupabaseVectorStore(embeddings, {
  client: supabase,
  tableName: config.supabase.tableName,
});

// Add documents to vector store
export async function addDocumentsToVectorStore(documents: Document[]): Promise<void> {
  try {
    console.log(`📤 Adding ${documents.length} document chunks to vector store...`);
    
    await vectorStore.addDocuments(documents);
    
    console.log(`✅ Successfully added ${documents.length} documents to vector store`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error adding documents to vector store:', errorMessage);
    throw new Error(`Failed to add documents to vector store: ${errorMessage}`);
  }
}

// Search for similar documents
export async function searchDocuments(query: string, k: number = config.retrieval.k): Promise<Document[]> {
  try {
    console.log(`🔍 Searching for documents similar to: "${query}"`);
    
    const results = await vectorStore.similaritySearch(query, k);
    
    console.log(`📄 Found ${results.length} similar documents`);
    
    return results;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error searching for documents:', errorMessage);
    throw new Error(`Error searching for documents: ${errorMessage}`);
  }
}

// Test retriever functionality
export async function testRetriever(): Promise<boolean> {
  try {
    console.log('🧪 Testing retriever functionality...');
    
    // Test embedding generation
    const testEmbedding = await embeddings.embedQuery('test query');
    if (!testEmbedding || testEmbedding.length === 0) {
      throw new Error('Failed to generate test embedding');
    }
    
    // Test vector store search (this will work even with empty database)
    await vectorStore.similaritySearch('test query', 1);
    
    console.log('✅ Retriever test passed');
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Retriever test failed:', errorMessage);
    throw new Error(`Retriever test failed. Check your OPENAI_API_KEY`);
  }
}
