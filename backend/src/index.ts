import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { runIngestion } from './graphs/ingestion.js';
import { runRetrieval } from './graphs/retrieval.js';
import { config } from './shared/config.js';
import { initializeAnalytics, analyticsMiddleware, trackEvent, trackError } from './middleware/analytics.js';
import analyticsRoutes from './routes/analytics.js';

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
    version: '1.0.0'
  });
});

// PDF ingestion endpoint with analytics tracking
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

      res.json({
        success: true,
        message: 'Files ingested successfully',
        data: {
          filesProcessed: result.processedFiles.length,
          totalChunks: result.totalChunks,
          files: result.processedFiles
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

// Chat endpoint with streaming support and analytics tracking
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

      // Track the question before processing
      await trackEvent({
        event_type: 'question_asked',
        user_id: req.analytics?.userId,
        session_id: req.analytics?.sessionId,
        metadata: {
          question: question,
          question_length: question.length,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Run retrieval with streaming
      const generator = runRetrieval(question);

      for await (const chunk of generator) {
        if (chunk.type === 'error') {
          res.write(`error: ${chunk.data}\n`);
          break;
        } else if (chunk.type === 'answer_chunk') {
          res.write(chunk.data);
        } else if (chunk.type === 'sources') {
          res.write(`\n\n**Sources:**\n`);
          const sources = chunk.data as Array<{
            filename: string;
            chunkIndex?: number;
            content: string;
            relevanceScore?: number;
          }>;
          sources.forEach((source, index) => {
            res.write(`${index + 1}. ${source.filename} (Relevance: ${Math.round((source.relevanceScore || 0.8) * 100)}%)\n`);
          });
        } else if (chunk.type === 'complete') {
          res.write('\n\n--- Response Complete ---');
          break;
        }
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
            question,
            response_time: processingTime,
            success: true,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        });
      });

      res.end();

    } catch (error) {
      console.error('❌ Chat error:', error);
      
      await trackError(error as Error, {
        endpoint: '/chat',
        question: req.body.question,
        processing_time: Date.now() - startTime
      }, req);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.write(`Error: ${errorMessage}`);
      res.end();
    }
  }
);

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
      req.path.startsWith('/analytics')) {
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
          <title>AI PDF Chatbot</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            .api-info { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
            pre { background: #333; color: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>🤖 AI PDF Chatbot API</h1>
          <p>The backend server is running successfully! Frontend static files are being built.</p>
          
          <div class="api-info">
            <h2>📡 Available API Endpoints:</h2>
            <ul>
              <li><strong>Health Check:</strong> GET <code>/health</code></li>
              <li><strong>Upload PDFs:</strong> POST <code>/ingest</code></li>
              <li><strong>Ask Questions:</strong> POST <code>/chat</code></li>
              <li><strong>Analytics Dashboard:</strong> GET <code>/analytics/dashboard</code></li>
            </ul>
          </div>

          <div class="api-info">
            <h3>🔧 Test the API:</h3>
            <p><strong>Upload a PDF:</strong></p>
            <pre>curl -X POST -F "files=@document.pdf" ${req.protocol}://${req.get('host')}/ingest</pre>
            
            <p><strong>Ask a question:</strong></p>
            <pre>curl -X POST -H "Content-Type: application/json" -d '{"question":"What is this document about?"}' ${req.protocol}://${req.get('host')}/chat</pre>
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running successfully on 0.0.0.0:${PORT}!`);
  console.log(`📍 Frontend: http://localhost:${PORT}/`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📤 Upload PDFs: POST http://localhost:${PORT}/ingest`);
  console.log(`💬 Ask questions: POST http://localhost:${PORT}/chat`);
  console.log(`📊 Analytics: GET http://localhost:${PORT}/analytics/dashboard`);
  console.log(`🎯 Ready to process PDFs and answer questions!`);
});

// Add analytics routes
app.use('/analytics', analyticsRoutes);

export default app;
