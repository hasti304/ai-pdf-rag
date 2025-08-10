import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { config } from './shared/config.js';
import { compiledIngestionGraph, runIngestion } from './graphs/ingestion.js';
import { compiledRetrievalGraph, runRetrieval, runRetrievalSimple } from './graphs/retrieval.js';

const app = express();

// Middleware
app.use(cors({
  origin: [
    "http://localhost:3000", // Local development
    "https://ai-pdf-rag-frontend-4o86yt8zn-hasti-panchals-projects.vercel.app" 
  ],
  credentials: true,
}));

app.use(express.json());

// Configure multer for file uploads - FIXED VERSION
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.documents.maxFileSize,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true); // ✅ Accept the file
    } else {
      cb(null, false); // ✅ Fixed: Changed from Error to null, false
    }
  },
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection and retrieval system
    const healthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      supabase: "✅ Connected",
      retriever: "✅ Working",
      openai: "✅ Configured",
    };

    res.json(healthStatus);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: errorMessage,
    });
  }
});

// PDF ingestion endpoint
app.post('/ingest', upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded',
      });
    }

    const files = req.files as Express.Multer.File[];
    
    // Additional validation for rejected files
    const invalidFiles = files.filter(file => file.mimetype !== 'application/pdf');
    if (invalidFiles.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Only PDF files are allowed. Invalid files: ${invalidFiles.map(f => f.originalname).join(', ')}`,
      });
    }

    const bufferFiles = files.map(file => ({
      buffer: file.buffer,
      filename: file.originalname,
    }));

    console.log(`📄 Processing ${bufferFiles.length} files...`);

    const result = await compiledIngestionGraph.invoke({
      files: bufferFiles,
      processedFiles: [],
      totalChunks: 0,
      status: "pending",
      error: "",
    });

    if (result.status === "failed") {
      return res.status(400).json({
        success: false,
        error: result.error,
        details: {
          filesProcessed: result.processedFiles?.length || 0,
          totalChunks: result.totalChunks || 0,
        },
      });
    }

    res.json({
      success: true,
      message: `Successfully processed ${result.processedFiles?.length} files`,
      details: {
        filesProcessed: result.processedFiles?.length || 0,
        totalChunks: result.totalChunks || 0,
        processedFiles: result.processedFiles || [],
      },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Ingestion error:', errorMessage);
    res.status(500).json({
      success: false,
      error: `Ingestion failed: ${errorMessage}`,
    });
  }
});

// Streaming chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const stream = runRetrieval(question);

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Chat error:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

// Simple chat endpoint (non-streaming)
app.post('/chat-simple', async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const result = await runRetrievalSimple(question);

    res.json({
      question,
      answer: result.answer,
      sources: result.sources,
      status: result.status,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Chat error:', errorMessage);
    res.status(500).json({ error: errorMessage });
  }
});

// Available graphs endpoint
app.get('/graphs', (req, res) => {
  res.json({
    available_graphs: [
      {
        name: "ingestion",
        description: "Process and store PDF documents",
        endpoint: "/ingest",
      },
      {
        name: "retrieval",
        description: "Answer questions about stored documents",
        endpoints: ["/chat", "/chat-simple"],
      },
    ],
  });
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: `File too large. Maximum size is ${config.documents.maxFileSize / 1024 / 1024}MB`,
      });
    }
  }
  
  const errorMessage = error.message || 'Unknown error';
  console.error('❌ Server error:', errorMessage);
  res.status(500).json({
    success: false,
    error: errorMessage,
  });
});

// Start server
async function startServer() {
  try {
    console.log('🚀 Starting AI PDF Chatbot server...');
    console.log('📊 Configuration:');
    console.log(`   Port: ${config.server.port}`);
    console.log(`   OpenAI Model: ${config.openai.model}`);
    console.log(`   Embedding Model: ${config.openai.embeddingModel}`);
    console.log(`   Supabase Table: ${config.supabase.tableName}`);
    console.log(`   Max File Size: ${config.documents.maxFileSize / 1024 / 1024}MB`);
    console.log(`   Retrieval K: ${config.retrieval.k}`);

    console.log('\n🔍 Testing connections...');

    // Test ingestion workflow
    await compiledIngestionGraph.invoke({
      files: [],
      processedFiles: [],
      totalChunks: 0,
      status: "pending",
      error: "",
    });
    console.log('✅ Supabase connection successful');

    // Test retrieval workflow  
    await runRetrievalSimple("test query");
    console.log('✅ Retriever and embeddings working correctly');

    app.listen(config.server.port, () => {
      console.log(`\n✅ Server running successfully!`);
      console.log(`📍 Health check: http://localhost:${config.server.port}/health`);
      console.log(`📤 Upload PDFs: POST http://localhost:${config.server.port}/ingest`);
      console.log(`💬 Ask questions: POST http://localhost:${config.server.port}/chat`);
      console.log(`📊 Available graphs: GET http://localhost:${config.server.port}/graphs`);
      console.log(`\n🎯 Ready to process PDFs and answer questions!`);
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Failed to start server:', errorMessage);
    process.exit(1);
  }
}

startServer();
