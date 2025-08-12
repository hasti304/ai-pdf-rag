import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { runIngestion } from './graphs/ingestion.js';
import { runRetrieval, runEnhancedRetrieval } from './graphs/retrieval.js';
import { config } from './shared/config.js';
import { initializeAnalytics, analyticsMiddleware, trackEvent, trackError } from './middleware/analytics.js';
import analyticsRoutes from './routes/analytics.js';
import clusteringRoutes from './routes/clustering.js';
import { queryAnalyzer } from './services/queryAnalyzer.js';
import { cacheManager } from './services/cacheManager.js';
import { documentClustering } from './services/documentClustering.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Add analytics middleware
app.use(initializeAnalytics);

// Add route handlers
app.use('/analytics', analyticsRoutes);
app.use('/clustering', clusteringRoutes);

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: config.documents.maxFileSize,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'));
    }
  },
});

console.log('🚀 Starting AI PDF Chatbot server...');
console.log('📊 Configuration:');
console.log(`   Port: ${PORT}`);
console.log(`   OpenAI Model: ${config.openai.model}`);
console.log(`   Embedding Model: ${config.openai.embeddingModel}`);
console.log(`   Supabase Table: ${config.supabase.tableName}`);
console.log(`   Max File Size: ${Math.round(config.documents.maxFileSize / 1024 / 1024)}MB`);
console.log(`   Retrieval K: ${config.retrieval.k}`);

// Test database connections
console.log('🔍 Testing connections...');

// Test ingestion with empty files (should fail gracefully)
try {
  await runIngestion([]);
} catch (error) {
  console.log('✅ Ingestion test completed (expected failure for empty files)');
}

// Test Supabase connection
try {
  const { testRetriever } = await import('./shared/retriever.js');
  await testRetriever();
  console.log('✅ Supabase connection successful');
} catch (error) {
  console.error('❌ Supabase connection failed:', error);
}

// Test embeddings and retrieval
try {
  const { runRetrievalSimple } = await import('./graphs/retrieval.js');
  const testResult = await runRetrievalSimple('test query');
  console.log('✅ Retriever and embeddings working correctly');
} catch (error) {
  console.error('❌ Retrieval test failed:', error);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'AI PDF Chatbot',
    version: '2.0.0',
    features: {
      analytics: 'enabled',
      query_classification: 'enabled',
      hybrid_search: 'enabled',
      intelligent_caching: 'enabled',
      document_clustering: 'enabled'
    }
  });
});

// PDF ingestion endpoint with analytics tracking and clustering
app.post('/ingest', 
  analyticsMiddleware('document_upload'), 
  upload.array('files', 10), 
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      console.log(`📤 Received ${req.files?.length || 0} files for ingestion`);
      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files provided'
        });
      }

      // Convert uploaded files to the expected format
      const files = (req.files as Express.Multer.File[]).map(file => ({
        buffer: file.buffer,
        filename: file.originalname
      }));

      console.log(`📋 Processing files: ${files.map(f => f.filename).join(', ')}`);

      // Run the ingestion process
      const result = await runIngestion(files);

      if (result.status === 'failed') {
        return res.status(500).json({
          success: false,
          error: result.error || 'Ingestion failed'
        });
      }

      // Track successful upload with detailed metrics
      await trackEvent({
        event_type: 'document_upload',
        user_id: req.analytics?.userId,
        session_id: req.analytics?.sessionId,
        metadata: {
          files_count: files.length,
          total_file_size: files.reduce((total, f) => total + f.buffer.length, 0),
          filenames: files.map(f => f.filename),
          processing_time: Date.now() - startTime,
          chunks_created: result.totalChunks,
          success: true
        },
        timestamp: new Date().toISOString()
      });

      // Trigger document clustering if we have enough documents
      console.log('🎯 Triggering document clustering after new uploads...');
      setTimeout(async () => {
        try {
          await documentClustering.performDocumentClustering();
          console.log('✅ Document clustering completed after upload');
        } catch (error) {
          console.error('❌ Post-upload clustering failed:', error);
        }
      }, 5000); // Delay to allow embeddings to be generated

      res.json({
        success: true,
        message: 'Files ingested successfully',
        data: {
          filesProcessed: result.processedFiles.length,
          totalChunks: result.totalChunks,
          files: result.processedFiles,
          clusteringTriggered: true
        }
      });

    } catch (error) {
      console.error('❌ Ingestion error:', error);
      
      // Track failed upload
      await trackError(error as Error, {
        endpoint: '/ingest',
        files_count: (req.files as Express.Multer.File[])?.length || 0,
        processing_time: Date.now() - startTime
      }, req);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: `Ingestion failed: ${errorMessage}`
      });
    }
  }
);

// Enhanced chat endpoint with query classification, caching, and hybrid search
app.post('/chat', 
  analyticsMiddleware('question_asked'),
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { question } = req.body;

      if (!question || typeof question !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Question is required and must be a string'
        });
      }

      console.log(`💬 Processing question: "${question}"`);

      // Step 1: Check cache for previous identical query
      const cachedResponse = await cacheManager.getCachedQueryResponse(question);
      if (cachedResponse) {
        console.log('⚡ Cache hit! Returning cached response');
        
        // Set headers for streaming (to maintain consistency)
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        
        // Send cached analysis and response
        res.write(`🎯 Cache Hit - Instant Response!\n\n`);
        res.write(`🔍 Query Analysis (cached):\n`);
        res.write(`📊 Category: ${cachedResponse.analysis?.category || 'Unknown'}\n`);
        res.write(`🎯 Complexity: ${cachedResponse.analysis?.complexity || 'Unknown'}\n`);
        res.write(`💪 Confidence: ${Math.round((cachedResponse.analysis?.confidence || 0.7) * 100)}%\n\n`);
        
        res.write(`💭 Cached Response:\n\n`);
        res.write(cachedResponse.response);
        
        res.write(`\n\n**Sources:**\n`);
        cachedResponse.sources.forEach((source: any, index: number) => {
          res.write(`${index + 1}. ${source.filename}\n`);
        });
        
        res.write('\n--- Cached Response Complete ---');
        res.end();
        return;
      }

      // Step 2: Analyze the query
      const analysisStartTime = Date.now();
      const queryContext = {
        previous_questions: [], // You can track this in session if needed
        session_id: req.analytics?.sessionId || 'unknown'
      };
      
      const queryAnalysis = await queryAnalyzer.analyzeQuery(question, queryContext);
      const enhancedQuery = await queryAnalyzer.enhanceQuery(question, queryAnalysis);
      
      console.log(`🔍 Query analysis completed in ${Date.now() - analysisStartTime}ms`);
      console.log(`📊 Category: ${queryAnalysis.category}, Complexity: ${queryAnalysis.complexity}, Confidence: ${queryAnalysis.confidence}`);

      // Track the enhanced query analysis
      await trackEvent({
        event_type: 'question_asked',
        user_id: req.analytics?.userId,
        session_id: req.analytics?.sessionId,
        metadata: {
          original_question: question,
          optimized_question: enhancedQuery.optimized_query,
          category: queryAnalysis.category,
          complexity: queryAnalysis.complexity,
          confidence: queryAnalysis.confidence,
          keywords: queryAnalysis.keywords,
          estimated_response_time: queryAnalysis.estimated_response_time,
          search_strategy: enhancedQuery.search_strategy,
          requires_multiple_docs: queryAnalysis.requires_multiple_docs,
          analysis_time: Date.now() - analysisStartTime,
          cache_hit: false,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send query analysis info to client
      res.write(`🔍 Query Analysis:\n`);
      res.write(`📊 Category: ${queryAnalysis.category.charAt(0).toUpperCase() + queryAnalysis.category.slice(1)}\n`);
      res.write(`🎯 Complexity: ${queryAnalysis.complexity.charAt(0).toUpperCase() + queryAnalysis.complexity.slice(1)}\n`);
      res.write(`💪 Confidence: ${Math.round(queryAnalysis.confidence * 100)}%\n`);
      res.write(`🔑 Key terms: ${queryAnalysis.keywords.join(', ')}\n`);
      res.write(`⚡ Estimated time: ~${queryAnalysis.estimated_response_time}s\n\n`);

      // Use the optimized query for retrieval
      const queryToUse = enhancedQuery.optimized_query !== question ? enhancedQuery.optimized_query : question;
      
      if (enhancedQuery.optimized_query !== question) {
        res.write(`🎯 Optimized query: "${queryToUse}"\n\n`);
      }

      res.write(`💭 Generating response with enhanced search...\n\n`);

      // Use enhanced retrieval with clustering and caching
      const generator = runEnhancedRetrieval(queryToUse, queryAnalysis);
      let fullResponse = '';
      let sources: any[] = [];

      for await (const chunk of generator) {
        if (chunk.type === 'error') {
          res.write(`error: ${chunk.data}\n`);
          break;
        } else if (chunk.type === 'answer_chunk') {
          res.write(chunk.data);
          fullResponse += chunk.data;
        } else if (chunk.type === 'search_metrics') {
          res.write(`\n🔍 Search Strategy: ${chunk.data.strategy} (${chunk.data.resultsFound} docs found)\n\n`);
        } else if (chunk.type === 'sources') {
          res.write(`\n\n**Sources:**\n`);
          sources = chunk.data as Array<{
            filename: string;
            chunkIndex?: number;
            content: string;
            relevanceScore?: number;
          }>;
          sources.forEach((source, index) => {
            res.write(`${index + 1}. ${source.filename} (Relevance: ${Math.round((source.relevanceScore || 0.8) * 100)}%)\n`);
          });
        } else if (chunk.type === 'complete') {
          // Add suggested follow-up questions
          res.write('\n\n**💡 Suggested Follow-up Questions:**\n');
          queryAnalysis.suggested_followups.slice(0, 3).forEach((followup, index) => {
            res.write(`${index + 1}. ${followup}\n`);
          });
          res.write('\n--- Response Complete ---');
          break;
        }
      }

      // Cache the successful response
      if (fullResponse && sources.length > 0) {
        const responseTime = Date.now() - startTime;
        const quality = Math.min(queryAnalysis.confidence * 1.2, 1.0); // Boost quality slightly
        
        await cacheManager.cacheQueryResponse(
          question,
          queryAnalysis,
          [], // searchResults - simplified for caching
          fullResponse,
          sources,
          responseTime,
          quality
        );
      }

      // Track completion after streaming ends
      res.on('finish', async () => {
        const processingTime = Date.now() - startTime;
        
        await trackEvent({
          event_type: 'api_call',
          user_id: req.analytics?.userId,
          session_id: req.analytics?.sessionId,
          metadata: {
            endpoint: '/chat',
            original_question: question,
            optimized_question: enhancedQuery.optimized_query,
            category: queryAnalysis.category,
            complexity: queryAnalysis.complexity,
            total_response_time: processingTime,
            analysis_time: enhancedQuery.processing_metadata.analysis_time,
            actual_vs_estimated: processingTime / 1000 / queryAnalysis.estimated_response_time,
            cache_hit: false,
            response_cached: fullResponse.length > 0,
            success: true,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        });
      });

      res.end();

    } catch (error) {
      console.error('❌ Enhanced chat error:', error);
      
      await trackError(error as Error, {
        endpoint: '/chat',
        question: req.body.question,
        processing_time: Date.now() - startTime,
        feature: 'enhanced_chat_with_caching'
      }, req);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.write(`Error: ${errorMessage}`);
      res.end();
    }
  }
);

// Cache management endpoints
app.get('/cache/stats', async (req, res) => {
  try {
    const stats = cacheManager.getStats();
    const efficiency = cacheManager.getCacheEfficiency();
    
    res.json({
      success: true,
      data: {
        stats,
        efficiency,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Cache stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache statistics'
    });
  }
});

app.post('/cache/clear', async (req, res) => {
  try {
    const { type } = req.body; // 'query', 'embedding', 'document', or undefined for all
    await cacheManager.clearCache(type);
    
    res.json({
      success: true,
      message: `Cache cleared: ${type || 'all'}`
    });
  } catch (error) {
    console.error('Cache clear error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

// Serve static files from Next.js build
const frontendPath = path.join(__dirname, '../../frontend/.next/static');
const frontendOutPath = path.join(__dirname, '../../frontend/out');

// Try to serve from Next.js export output first, then fallback
app.use(express.static(frontendOutPath));
app.use('/_next/static', express.static(frontendPath));

// Serve the main HTML file
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/health') || 
      req.path.startsWith('/ingest') || 
      req.path.startsWith('/chat') ||
      req.path.startsWith('/analytics') ||
      req.path.startsWith('/clustering') ||
      req.path.startsWith('/cache')) {
    return next();
  }

  const indexPath = path.join(frontendOutPath, 'index.html');
  
  // Check if the file exists before trying to serve it
  import('fs').then(fs => {
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      // Fallback response if frontend files aren't available
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>AI PDF Chatbot v2.0</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            .api-info { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
            pre { background: #333; color: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; }
            .feature { background: #e8f5e8; padding: 15px; margin: 10px 0; border-radius: 5px; }
          </style>
        </head>
        <body>
          <h1>🤖 AI PDF Chatbot v2.0 API</h1>
          <p>The advanced backend server is running successfully! Frontend static files are being built.</p>
          
          <div class="feature">
            <h2>🆕 Phase 2 Features</h2>
            <ul>
              <li>✅ <strong>Intelligent Caching</strong> - Lightning-fast responses for repeated queries</li>
              <li>✅ <strong>Document Clustering</strong> - Smart organization and similarity detection</li>
              <li>✅ <strong>Enhanced Analytics</strong> - Advanced performance monitoring</li>
              <li>✅ <strong>Hybrid Search</strong> - Multi-strategy document retrieval</li>
            </ul>
          </div>
          
          <div class="api-info">
            <h2>📡 Available API Endpoints:</h2>
            <ul>
              <li><strong>Health Check:</strong> GET <code>/health</code></li>
              <li><strong>Upload PDFs:</strong> POST <code>/ingest</code></li>
              <li><strong>Enhanced Chat:</strong> POST <code>/chat</code> (with caching & clustering)</li>
              <li><strong>Analytics Dashboard:</strong> GET <code>/analytics/dashboard</code></li>
              <li><strong>Document Clustering:</strong> POST <code>/clustering/cluster</code></li>
              <li><strong>Find Similar Docs:</strong> POST <code>/clustering/similar</code></li>
              <li><strong>Cache Statistics:</strong> GET <code>/cache/stats</code></li>
            </ul>
          </div>

          <div class="api-info">
            <h3>🔧 Test the Enhanced API:</h3>
            <p><strong>Upload a PDF:</strong></p>
            <pre>curl -X POST -F "files=@document.pdf" ${req.protocol}://${req.get('host')}/ingest</pre>
            
            <p><strong>Ask a question (with caching):</strong></p>
            <pre>curl -X POST -H "Content-Type: application/json" -d '{"question":"What is artificial intelligence?"}' ${req.protocol}://${req.get('host')}/chat</pre>
            
            <p><strong>Trigger document clustering:</strong></p>
            <pre>curl -X POST -H "Content-Type: application/json" -d '{"forceReclustering":true}' ${req.protocol}://${req.get('host')}/clustering/cluster</pre>
            
            <p><strong>Check cache performance:</strong></p>
            <pre>curl ${req.protocol}://${req.get('host')}/cache/stats</pre>
          </div>
        </body>
        </html>
      `);
    }
  }).catch(() => {
    res.status(500).json({ error: 'Server configuration error' });
  });
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Server error:', error.message);
  
  // Track server errors
  trackError(error, {
    endpoint: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  }, req);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: `File too large. Maximum size is ${Math.round(config.documents.maxFileSize / 1024 / 1024)}MB`
      });
    }
  }
  
  res.status(500).json({
    success: false,
    error: error.message || 'Internal server error'
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  cacheManager.destroy();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  cacheManager.destroy();
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running successfully on 0.0.0.0:${PORT}!`);
  console.log(`📍 Frontend: http://localhost:${PORT}/`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📤 Upload PDFs: POST http://localhost:${PORT}/ingest`);
  console.log(`💬 Enhanced Chat: POST http://localhost:${PORT}/chat (with AI classification, caching & clustering)`);
  console.log(`📊 Analytics: GET http://localhost:${PORT}/analytics/dashboard`);
  console.log(`🎯 Document Clustering: POST http://localhost:${PORT}/clustering/cluster`);
  console.log(`⚡ Cache Management: GET http://localhost:${PORT}/cache/stats`);
  console.log(`🎯 Ready to process PDFs with Phase 2 ML enhancements!`);
});

export default app;
