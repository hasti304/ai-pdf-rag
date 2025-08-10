import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { supabase } from './supabase.js';
import { config } from '../shared/config';

// Initialize OpenAI embeddings
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: config.openai.apiKey,
  modelName: config.openai.embeddingModel,
});

// Initialize Supabase vector store
export const vectorStore = new SupabaseVectorStore(embeddings, {
  client: supabase,
  tableName: config.supabase.tableName,
  queryName: 'match_documents',
});

// Add documents to vector store
export async function addDocumentsToVectorStore(documents: Document[]): Promise<void> {
  try {
    console.log(`🔄 Adding ${documents.length} documents to vector store...`);

    // Add documents with embeddings
    await vectorStore.addDocuments(documents);

    console.log(`✅ Successfully added ${documents.length} documents to vector store`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error adding documents to vector store:', errorMessage);
    throw new Error(`Vector store operation failed: ${errorMessage}`);
  }
}

// Search for relevant documents
export async function searchDocuments(query: string, k: number = config.retrieval.k): Promise<Document[]> {
  try {
    console.log(`🔍 Searching for documents related to: "${query}"`);

    // Perform similarity search
    const results = await vectorStore.similaritySearch(query, k);

    console.log(`📋 Found ${results.length} relevant documents`);
    return results;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error searching documents:', errorMessage);
    throw new Error(`Document search failed: ${errorMessage}`);
  }
}

// Search for documents with similarity scores
export async function searchDocumentsWithScore(
  query: string, 
  k: number = config.retrieval.k
): Promise<[Document, number][]> {
  try {
    console.log(`🔍 Searching for documents with scores: "${query}"`);

    // Perform similarity search with scores
    const results = await vectorStore.similaritySearchWithScore(query, k);

    console.log(`📋 Found ${results.length} relevant documents with scores`);
    return results;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error searching documents with scores:', errorMessage);
    throw new Error(`Document search with scores failed: ${errorMessage}`);
  }
}

// Test retriever functionality
export async function testRetriever(): Promise<boolean> {
  try {
    // Try to search for a test query
    await vectorStore.similaritySearch("test", 1);
    console.log('✅ Retriever and embeddings working correctly');
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Retriever test failed:', errorMessage);
    return false;
  }
}
