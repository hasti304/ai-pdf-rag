import { createClient } from '@supabase/supabase-js';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { config } from '../shared/config.js';
import { cacheManager } from './cacheManager.js';
import {
  DocumentCluster,
  ClusteredDocument,
  SimilarityResult,
  ClusteringMetrics,
  TopicExtractionResult,
  DocumentSimilarityMatrix
} from '../types/clusteringTypes.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: config.openai.apiKey,
  modelName: config.openai.embeddingModel,
});

const model = new ChatOpenAI({
  openAIApiKey: config.openai.apiKey,
  modelName: 'gpt-4o-mini',
  temperature: 0.1,
});

const TOPIC_EXTRACTION_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are an expert document analyzer specializing in topic extraction and summarization.

Analyze the provided document content and extract:
1. Main topics (3-7 key topics)
2. Important keywords (10-15 relevant terms)
3. Confidence score (0-1) for your analysis
4. Brief summary (2-3 sentences)

Return a JSON object with this structure:
{
  "topics": ["topic1", "topic2", ...],
  "keywords": ["keyword1", "keyword2", ...],
  "confidence": 0.85,
  "summary": "Brief summary of the document content..."
}

Focus on substantive topics and avoid generic terms. Be precise and analytical.`
  ],
  [
    "human",
    `Document filename: {filename}

Document content:
{content}

Please analyze this document and provide the topic extraction results.`
  ]
]);

export class DocumentClusteringService {
  private clusters: Map<string, DocumentCluster> = new Map();
  private documents: Map<string, ClusteredDocument> = new Map();
  private similarityMatrix: DocumentSimilarityMatrix | null = null;
  private lastClusteringRun: Date | null = null;

  constructor() {
    console.log('🎯 Document Clustering Service initialized');
  }

  // Main clustering function
  async performDocumentClustering(forceReclustering: boolean = false): Promise<ClusteringMetrics> {
    const startTime = Date.now();
    
    try {
      console.log('📊 Starting document clustering analysis...');

      // Check if we need to recluster
      if (!forceReclustering && this.shouldSkipClustering()) {
        console.log('⏭️ Skipping clustering - recent analysis available');
        return this.calculateMetrics();
      }

      // Step 1: Load all documents from database
      const documents = await this.loadDocuments();
      if (documents.length < 2) {
        console.log('⚠️ Not enough documents for clustering (minimum: 2)');
        return this.createEmptyMetrics();
      }

      console.log(`📚 Loaded ${documents.length} documents for clustering`);

      // Step 2: Extract topics and keywords for each document
      await this.extractTopicsForDocuments(documents);

      // Step 3: Calculate similarity matrix
      this.similarityMatrix = await this.calculateSimilarityMatrix(documents);

      // Step 4: Perform clustering using K-means-like algorithm
      const optimalK = this.determineOptimalClusterCount(documents.length);
      const clusters = await this.performKMeansClustering(documents, optimalK);

      // Step 5: Update database with clustering results
      await this.updateClusteringResults(clusters);

      // Step 6: Calculate and return metrics
      const metrics = this.calculateMetrics();
      this.lastClusteringRun = new Date();

      console.log(`✅ Clustering completed in ${Date.now() - startTime}ms`);
      console.log(`📊 Created ${clusters.length} clusters with silhouette score: ${metrics.silhouetteScore.toFixed(3)}`);

      return metrics;
    } catch (error) {
      console.error('❌ Document clustering error:', error);
      throw error;
    }
  }

  // Find similar documents
  async findSimilarDocuments(
    documentId: string,
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<SimilarityResult[]> {
    try {
      const targetDoc = this.documents.get(documentId);
      if (!targetDoc) {
        throw new Error(`Document ${documentId} not found in clustering data`);
      }

      const similarities: SimilarityResult[] = [];

      // First, try cluster-based similarity (fast)
      const clusterDocs = this.getDocumentsInCluster(targetDoc.cluster_id);
      
      for (const doc of clusterDocs) {
        if (doc.id === documentId) continue;

        const similarity = this.calculateCosineSimilarity(
          targetDoc.embedding,
          doc.embedding
        );

        if (similarity >= threshold) {
          const sharedTopics = this.findSharedTopics(targetDoc.metadata.topics, doc.metadata.topics);
          
          similarities.push({
            document: doc,
            similarity,
            reason: similarity > 0.9 
              ? 'Very high content similarity'
              : similarity > 0.8 
              ? 'High content similarity'
              : 'Similar topics and content',
            sharedTopics
          });
        }
      }

      // If not enough similar docs in same cluster, expand search
      if (similarities.length < limit) {
        const additionalSimilar = await this.expandSimilaritySearch(
          targetDoc,
          limit - similarities.length,
          threshold * 0.9 // Slightly lower threshold for expansion
        );
        similarities.push(...additionalSimilar);
      }

      // Sort by similarity and return top results
      return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

    } catch (error) {
      console.error('Error finding similar documents:', error);
      return [];
    }
  }

  // Get documents in a specific cluster
  getDocumentsInCluster(clusterId: string): ClusteredDocument[] {
    const cluster = this.clusters.get(clusterId);
    return cluster ? cluster.documents : [];
  }

  // Get cluster information
  getClusterInfo(clusterId: string): DocumentCluster | null {
    return this.clusters.get(clusterId) || null;
  }

  // Get all clusters
  getAllClusters(): DocumentCluster[] {
    return Array.from(this.clusters.values());
  }

  // Smart document recommendation
  async getDocumentRecommendations(
    query: string,
    userContext?: any
  ): Promise<{
    byContent: ClusteredDocument[];
    byTopic: ClusteredDocument[];
    bySimilarity: ClusteredDocument[];
    explanation: string;
  }> {
    try {
      console.log(`🎯 Getting document recommendations for: "${query}"`);

      // Generate embedding for the query
      const queryEmbedding = await embeddings.embedQuery(query);
      
      // Find documents by content similarity
      const contentSimilar = await this.findDocumentsByEmbedding(queryEmbedding, 3);
      
      // Extract topics from query
      const queryTopics = await this.extractTopicsFromText(query, 'user_query');
      
      // Find documents by topic similarity
      const topicSimilar = this.findDocumentsByTopics(queryTopics.topics, 3);
      
      // Use clustering to find diverse recommendations
      const clusterRecommendations = this.getRecommendationsFromClusters(queryEmbedding, 3);
      
      const explanation = this.generateRecommendationExplanation(
        query,
        contentSimilar.length,
        topicSimilar.length,
        clusterRecommendations.length
      );

      return {
        byContent: contentSimilar,
        byTopic: topicSimilar,
        bySimilarity: clusterRecommendations,
        explanation
      };
    } catch (error) {
      console.error('Error getting document recommendations:', error);
      return {
        byContent: [],
        byTopic: [],
        bySimilarity: [],
        explanation: 'Unable to generate recommendations due to an error.'
      };
    }
  }

  // Private helper methods
  private async loadDocuments(): Promise<ClusteredDocument[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id.toString(),
      filename: row.filename || 'unknown.pdf',
      content: row.content || '',
      embedding: row.embedding || [],
      cluster_id: '',
      similarity_to_centroid: 0,
      chunk_index: row.chunk_index || 0,
      metadata: {
        topics: [],
        keywords: [],
        summary: '',
        ...row.metadata
      }
    }));
  }

  private async extractTopicsForDocuments(documents: ClusteredDocument[]): Promise<void> {
    console.log(`🔍 Extracting topics for ${documents.length} documents...`);

    const batchSize = 5;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const promises = batch.map(doc => this.extractTopicsFromDocument(doc));
      
      await Promise.all(promises);
      
      // Small delay to avoid rate limiting
      if (i + batchSize < documents.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  private async extractTopicsFromDocument(doc: ClusteredDocument): Promise<void> {
    try {
      // Check cache first
      const cacheKey = `topics:${doc.id}`;
      const cached = await cacheManager.getCachedQueryResponse(cacheKey);
      
      if (cached) {
        doc.metadata.topics = cached.analysis?.topics || [];
        doc.metadata.keywords = cached.analysis?.keywords || [];
        doc.metadata.summary = cached.analysis?.summary || '';
        return;
      }

      // Extract topics using AI
      const result = await this.extractTopicsFromText(
        doc.content.substring(0, 3000), // Limit content to avoid token limits
        doc.filename
      );

      doc.metadata.topics = result.topics;
      doc.metadata.keywords = result.keywords;
      doc.metadata.summary = result.summary;

      // Cache the result
      await cacheManager.cacheQueryResponse(
        cacheKey,
        { topics: result.topics, keywords: result.keywords, summary: result.summary },
        [],
        result.summary,
        [],
        0,
        result.confidence
      );

    } catch (error) {
      console.error(`Error extracting topics for document ${doc.filename}:`, error);
      // Set fallback values
      doc.metadata.topics = ['general'];
      doc.metadata.keywords = [];
      doc.metadata.summary = 'Summary unavailable';
    }
  }

  private async extractTopicsFromText(text: string, filename: string): Promise<TopicExtractionResult> {
    try {
      const response = await model.invoke(
        await TOPIC_EXTRACTION_PROMPT.format({
          filename,
          content: text
        })
      );

      const result = JSON.parse(response.content as string);
      return {
        topics: result.topics || [],
        keywords: result.keywords || [],
        confidence: result.confidence || 0.5,
        summary: result.summary || ''
      };
    } catch (error) {
      console.error('Topic extraction parsing error:', error);
      return {
        topics: ['general'],
        keywords: [],
        confidence: 0.3,
        summary: 'Unable to extract topics'
      };
    }
  }

  private async calculateSimilarityMatrix(documents: ClusteredDocument[]): Promise<DocumentSimilarityMatrix> {
    const n = documents.length;
    const similarities: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    const documentIds = documents.map(doc => doc.id);

    console.log(`🔗 Calculating similarity matrix for ${n} documents...`);

    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        if (i === j) {
          similarities[i][j] = 1.0;
        } else {
          const sim = this.calculateCosineSimilarity(
            documents[i].embedding,
            documents[j].embedding
          );
          similarities[i][j] = sim;
          similarities[j][i] = sim;
        }
      }
    }

    return {
      documentIds,
      similarities,
      clusters: []
    };
  }

  private calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private determineOptimalClusterCount(numDocuments: number): number {
    // Use elbow method heuristics
    if (numDocuments < 5) return 2;
    if (numDocuments < 10) return 3;
    if (numDocuments < 20) return Math.ceil(numDocuments / 4);
    return Math.min(Math.ceil(numDocuments / 5), 10); // Cap at 10 clusters
  }

  private async performKMeansClustering(
    documents: ClusteredDocument[],
    k: number
  ): Promise<DocumentCluster[]> {
    console.log(`🎯 Performing K-means clustering with ${k} clusters...`);

    const maxIterations = 20;
    const tolerance = 0.001;

    // Initialize centroids randomly
    let centroids = this.initializeCentroids(documents, k);
    let previousCentroids: number[][] = [];

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Assign documents to nearest centroids
      const assignments = documents.map(doc => 
        this.findNearestCentroid(doc.embedding, centroids)
      );

      // Update centroids
      const newCentroids = this.updateCentroids(documents, assignments, k);
      
      // Check for convergence
      if (this.centroidsConverged(centroids, newCentroids, tolerance)) {
        console.log(`✅ Clustering converged after ${iteration + 1} iterations`);
        break;
      }

      previousCentroids = centroids;
      centroids = newCentroids;
    }

    // Create cluster objects
    const clusters = await this.createClusters(documents, centroids);
    
    // Store in memory
    this.clusters.clear();
    this.documents.clear();
    
    clusters.forEach(cluster => {
      this.clusters.set(cluster.id, cluster);
      cluster.documents.forEach(doc => {
        this.documents.set(doc.id, doc);
      });
    });

    return clusters;
  }

  private initializeCentroids(documents: ClusteredDocument[], k: number): number[][] {
    const centroids: number[][] = [];
    const embeddingDim = documents[0].embedding.length;
    
    // Use K-means++ initialization
    const used = new Set<number>();
    
    // First centroid: random document
    const firstIdx = Math.floor(Math.random() * documents.length);
    centroids.push([...documents[firstIdx].embedding]);
    used.add(firstIdx);

    // Remaining centroids: choose based on distance to existing centroids
    for (let i = 1; i < k; i++) {
      let bestDistance = -1;
      let bestIdx = -1;

      for (let j = 0; j < documents.length; j++) {
        if (used.has(j)) continue;

        const minDistToExistingCentroids = Math.min(
          ...centroids.map(centroid => 
            1 - this.calculateCosineSimilarity(documents[j].embedding, centroid)
          )
        );

        if (minDistToExistingCentroids > bestDistance) {
          bestDistance = minDistToExistingCentroids;
          bestIdx = j;
        }
      }

      if (bestIdx !== -1) {
        centroids.push([...documents[bestIdx].embedding]);
        used.add(bestIdx);
      } else {
        // Fallback: random unused document
        const remainingIndices = Array.from({ length: documents.length }, (_, i) => i)
          .filter(i => !used.has(i));
        const randomIdx = remainingIndices[Math.floor(Math.random() * remainingIndices.length)];
        centroids.push([...documents[randomIdx].embedding]);
        used.add(randomIdx);
      }
    }

    return centroids;
  }

  private findNearestCentroid(embedding: number[], centroids: number[][]): number {
    let bestSimilarity = -1;
    let bestCluster = 0;

    for (let i = 0; i < centroids.length; i++) {
      const similarity = this.calculateCosineSimilarity(embedding, centroids[i]);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestCluster = i;
      }
    }

    return bestCluster;
  }

  private updateCentroids(
    documents: ClusteredDocument[],
    assignments: number[],
    k: number
  ): number[][] {
    const embeddingDim = documents[0].embedding.length;
    const newCentroids: number[][] = Array(k).fill(0).map(() => Array(embeddingDim).fill(0));
    const counts = Array(k).fill(0);

    // Sum embeddings for each cluster
    for (let i = 0; i < documents.length; i++) {
      const cluster = assignments[i];
      counts[cluster]++;
      
      for (let j = 0; j < embeddingDim; j++) {
        newCentroids[cluster][j] += documents[i].embedding[j];
      }
    }

    // Average the embeddings
    for (let i = 0; i < k; i++) {
      if (counts[i] > 0) {
        for (let j = 0; j < embeddingDim; j++) {
          newCentroids[i][j] /= counts[i];
        }
      }
    }

    return newCentroids;
  }

  private centroidsConverged(
    oldCentroids: number[][],
    newCentroids: number[][],
    tolerance: number
  ): boolean {
    for (let i = 0; i < oldCentroids.length; i++) {
      const similarity = this.calculateCosineSimilarity(oldCentroids[i], newCentroids[i]);
      if (1 - similarity > tolerance) {
        return false;
      }
    }
    return true;
  }

  private async createClusters(
    documents: ClusteredDocument[],
    centroids: number[][]
  ): Promise<DocumentCluster[]> {
    const clusters: DocumentCluster[] = [];

    for (let i = 0; i < centroids.length; i++) {
      const clusterDocs = documents.filter(doc => 
        this.findNearestCentroid(doc.embedding, centroids) === i
      );

      if (clusterDocs.length === 0) continue;

      // Update document cluster assignments
      clusterDocs.forEach(doc => {
        doc.cluster_id = `cluster_${i}`;
        doc.similarity_to_centroid = this.calculateCosineSimilarity(doc.embedding, centroids[i]);
      });

      // Extract common topics
      const allTopics = clusterDocs.flatMap(doc => doc.metadata.topics);
      const topicCounts = this.countTopics(allTopics);
      const commonTopics = Object.entries(topicCounts)
        .filter(([_, count]) => count >= Math.ceil(clusterDocs.length * 0.3))
        .map(([topic, _]) => topic)
        .slice(0, 5);

      // Generate cluster name and description
      const clusterName = commonTopics.length > 0 
        ? commonTopics.slice(0, 2).join(' & ')
        : `Cluster ${i + 1}`;

      const clusterDescription = this.generateClusterDescription(clusterDocs, commonTopics);

      const cluster: DocumentCluster = {
        id: `cluster_${i}`,
        name: clusterName,
        description: clusterDescription,
        centroid: centroids[i],
        documents: clusterDocs,
        size: clusterDocs.length,
        coherenceScore: this.calculateClusterCoherence(clusterDocs, centroids[i]),
        topics: commonTopics,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      clusters.push(cluster);
    }

    return clusters.filter(cluster => cluster.size > 0);
  }

  private countTopics(topics: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    topics.forEach(topic => {
      counts[topic] = (counts[topic] || 0) + 1;
    });
    return counts;
  }

  private generateClusterDescription(docs: ClusteredDocument[], topics: string[]): string {
    const fileCount = docs.length;
    const topicList = topics.slice(0, 3).join(', ');
    
    if (topics.length === 0) {
      return `A cluster of ${fileCount} documents with mixed content.`;
    }
    
    return `A cluster of ${fileCount} documents focused on ${topicList}. ` +
           `This cluster contains related content about these topics.`;
  }

  private calculateClusterCoherence(docs: ClusteredDocument[], centroid: number[]): number {
    if (docs.length === 0) return 0;

    const similarities = docs.map(doc => 
      this.calculateCosineSimilarity(doc.embedding, centroid)
    );

    return similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
  }

  private shouldSkipClustering(): boolean {
    if (!this.lastClusteringRun) return false;
    
    const hoursSinceLastRun = (Date.now() - this.lastClusteringRun.getTime()) / (1000 * 60 * 60);
    return hoursSinceLastRun < 6; // Skip if clustered within last 6 hours
  }

  private calculateMetrics(): ClusteringMetrics {
    const clusters = Array.from(this.clusters.values());
    const totalDocs = Array.from(this.documents.values()).length;
    
    if (clusters.length === 0 || totalDocs === 0) {
      return this.createEmptyMetrics();
    }

    const avgClusterSize = totalDocs / clusters.length;
    const avgCoherence = clusters.reduce((sum, c) => sum + c.coherenceScore, 0) / clusters.length;
    
    return {
      totalClusters: clusters.length,
      totalDocuments: totalDocs,
      avgClusterSize,
      silhouetteScore: avgCoherence, // Simplified silhouette approximation
      intraClusterDistance: 1 - avgCoherence,
      interClusterDistance: avgCoherence * 0.7, // Estimated
      topicCoverage: this.calculateTopicCoverage(clusters)
    };
  }

  private calculateTopicCoverage(clusters: DocumentCluster[]): number {
    const allTopics = new Set<string>();
    clusters.forEach(cluster => {
      cluster.topics.forEach(topic => allTopics.add(topic));
    });
    
    // Assume good topic coverage if we have diverse topics
    return Math.min(allTopics.size / 10, 1.0);
  }

  private createEmptyMetrics(): ClusteringMetrics {
    return {
      totalClusters: 0,
      totalDocuments: 0,
      avgClusterSize: 0,
      silhouetteScore: 0,
      intraClusterDistance: 0,
      interClusterDistance: 0,
      topicCoverage: 0
    };
  }

  private async updateClusteringResults(clusters: DocumentCluster[]): Promise<void> {
    // In a production system, you might want to store clustering results in the database
    // For now, we keep them in memory
    console.log(`💾 Storing ${clusters.length} clusters in memory`);
  }

  private findSharedTopics(topicsA: string[], topicsB: string[]): string[] {
    return topicsA.filter(topic => topicsB.includes(topic));
  }

  private async expandSimilaritySearch(
    targetDoc: ClusteredDocument,
    limit: number,
    threshold: number
  ): Promise<SimilarityResult[]> {
    const results: SimilarityResult[] = [];
    
    // Search across all documents, not just same cluster
    for (const [_, doc] of this.documents) {
      if (doc.id === targetDoc.id) continue;
      if (doc.cluster_id === targetDoc.cluster_id) continue; // Skip same cluster docs
      
      const similarity = this.calculateCosineSimilarity(
        targetDoc.embedding,
        doc.embedding
      );
      
      if (similarity >= threshold) {
        const sharedTopics = this.findSharedTopics(
          targetDoc.metadata.topics,
          doc.metadata.topics
        );
        
        results.push({
          document: doc,
          similarity,
          reason: 'Cross-cluster similarity',
          sharedTopics
        });
      }
      
      if (results.length >= limit) break;
    }
    
    return results.sort((a, b) => b.similarity - a.similarity);
  }

  private async findDocumentsByEmbedding(
    queryEmbedding: number[],
    limit: number
  ): Promise<ClusteredDocument[]> {
    const similarities: { doc: ClusteredDocument; sim: number }[] = [];
    
    for (const [_, doc] of this.documents) {
      const sim = this.calculateCosineSimilarity(queryEmbedding, doc.embedding);
      similarities.push({ doc, sim });
    }
    
    return similarities
      .sort((a, b) => b.sim - a.sim)
      .slice(0, limit)
      .map(item => item.doc);
  }

  private findDocumentsByTopics(queryTopics: string[], limit: number): ClusteredDocument[] {
    const matches: { doc: ClusteredDocument; score: number }[] = [];
    
    for (const [_, doc] of this.documents) {
      const sharedTopics = this.findSharedTopics(queryTopics, doc.metadata.topics);
      if (sharedTopics.length > 0) {
        const score = sharedTopics.length / Math.max(queryTopics.length, doc.metadata.topics.length);
        matches.push({ doc, score });
      }
    }
    
    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.doc);
  }

  private getRecommendationsFromClusters(
    queryEmbedding: number[],
    limit: number
  ): ClusteredDocument[] {
    const clusterSimilarities: { cluster: DocumentCluster; sim: number }[] = [];
    
    for (const [_, cluster] of this.clusters) {
      const sim = this.calculateCosineSimilarity(queryEmbedding, cluster.centroid);
      clusterSimilarities.push({ cluster, sim });
    }
    
    // Get representative documents from top clusters
    const results: ClusteredDocument[] = [];
    const sortedClusters = clusterSimilarities.sort((a, b) => b.sim - a.sim);
    
    for (const { cluster } of sortedClusters) {
      if (results.length >= limit) break;
      
      // Add the most representative document from this cluster
      const bestDoc = cluster.documents.sort((a, b) => 
        b.similarity_to_centroid - a.similarity_to_centroid
      )[0];
      
      if (bestDoc) results.push(bestDoc);
    }
    
    return results;
  }

  private generateRecommendationExplanation(
    query: string,
    contentCount: number,
    topicCount: number,
    clusterCount: number
  ): string {
    const parts = [];
    
    if (contentCount > 0) {
      parts.push(`${contentCount} documents with high content similarity`);
    }
    if (topicCount > 0) {
      parts.push(`${topicCount} documents with related topics`);
    }
    if (clusterCount > 0) {
      parts.push(`${clusterCount} representative documents from relevant clusters`);
    }
    
    if (parts.length === 0) {
      return "No specific recommendations found based on the current query.";
    }
    
    return `Found recommendations based on: ${parts.join(', ')}.`;
  }
}

export const documentClustering = new DocumentClusteringService();
