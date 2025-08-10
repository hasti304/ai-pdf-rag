import express from "express";
import cors from "cors";
import multer from "multer";
import { config } from '../src/shared/config';
import { testSupabaseConnection } from "./shared/supabase.js";
import { testRetriever } from "./shared/retriever.js";
import { compiledIngestionGraph, runIngestion } from "./graphs/ingestion.js";
import { compiledRetrievalGraph, runRetrieval, runRetrievalSimple } from "./graphs/retrieval.js";

// Create Express app
const app = express();
const PORT = config.server.port;

// Middleware
app.use(cors({
  origin: ["http://localhost:3000"],
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.documents.maxFileSize,
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const supabaseOk = await testSupabaseConnection();
    const retrieverOk = await testRetriever();
    
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      checks: {
        supabase: supabaseOk ? "✅ Connected" : "❌ Failed",
        retriever: retrieverOk ? "✅ Working" : "❌ Failed",
        openai: config.openai.apiKey ? "✅ Configured" : "❌ Missing API key",
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      status: "unhealthy",
      error: errorMessage,
    });
  }
});

// Ingestion endpoint - Upload and process PDFs
app.post("/ingest", upload.array("files", 5), async (req, res) => {
  console.log("📤 Received ingestion request");
  
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No files uploaded. Please upload at least one PDF file.",
      });
    }
    
    const files = (req.files as Express.Multer.File[]).map(file => ({
      filename: file.originalname,
      buffer: file.buffer,
      size: file.size,
    }));
    
    console.log(`Processing ${files.length} files:`, files.map(f => f.filename));
    
    const result = await runIngestion(files);
    
    if (result.status === "completed") {
      res.json({
        success: true,
        message: result.message,
        details: {
          filesProcessed: result.processedFiles?.length || 0,
          totalChunks: result.totalChunks,
          processedFiles: result.processedFiles || [],
        },
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
        details: {
          errors: result.errors || [],
          partialSuccess: (result.processedFiles?.length || 0) > 0,
          filesProcessed: result.processedFiles || [],
        },
      });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("❌ Ingestion error:", errorMessage);
    res.status(500).json({
      success: false,
      error: "Internal server error during file processing",
      details: errorMessage,
    });
  }
});

// Chat endpoint - Ask questions and get streaming responses
app.post("/chat", async (req, res) => {
  console.log("💬 Received chat request");
  
  try {
    const { question } = req.body;
    
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Question is required and must be a non-empty string",
      });
    }
    
    console.log(`Question: "${question}"`);
    
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "http://localhost:3000",
      "Access-Control-Allow-Headers": "Cache-Control",
    });
    
    try {
      for await (const chunk of runRetrieval(question)) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (streamError: unknown) {
      const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown streaming error';
      console.error("❌ Streaming error:", errorMessage);
      res.write(`data: ${JSON.stringify({
        type: "error",
        data: errorMessage
      })}\n\n`);
      res.end();
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("❌ Chat error:", errorMessage);
    res.status(500).json({
      success: false,
      error: "Internal server error during chat processing",
      details: errorMessage,
    });
  }
});

// Non-streaming chat endpoint for testing
app.post("/chat-simple", async (req, res) => {
  console.log("💬 Received simple chat request");
  
  try {
    const { question } = req.body;
    
    if (!question || typeof question !== "string") {
      return res.status(400).json({
        success: false,
        error: "Question is required",
      });
    }
    
    const result = await runRetrievalSimple(question);
    
    res.json({
      success: true,
      question,
      answer: result.answer,
      sources: result.sources,
      status: result.status,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("❌ Simple chat error:", errorMessage);
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

// LangGraph specific endpoints for graph introspection
app.get("/graphs", (req, res) => {
  res.json({
    available_graphs: [
      {
        id: "ingestion_graph",
        name: "PDF Ingestion Graph",
        description: "Processes uploaded PDFs and stores them in the vector database",
        endpoints: ["/ingest"],
      },
      {
        id: "retrieval_graph", 
        name: "Document Retrieval Graph",
        description: "Retrieves relevant documents and generates AI responses",
        endpoints: ["/chat", "/chat-simple"],
      },
    ],
  });
});

// Start server
async function startServer() {
  try {
    console.log("🚀 Starting AI PDF Chatbot server...");
    console.log(`📊 Configuration:`);
    console.log(`   Port: ${PORT}`);
    console.log(`   OpenAI Model: ${config.openai.model}`);
    console.log(`   Embedding Model: ${config.openai.embeddingModel}`);
    console.log(`   Supabase Table: ${config.supabase.tableName}`);
    console.log(`   Max File Size: ${config.documents.maxFileSize / (1024 * 1024)}MB`);
    console.log(`   Retrieval K: ${config.retrieval.k}`);
    
    console.log("\n🔍 Testing connections...");
    const supabaseOk = await testSupabaseConnection();
    const retrieverOk = await testRetriever();
    
    if (!supabaseOk) {
      throw new Error("Supabase connection failed. Check your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    }
    
    if (!retrieverOk) {
      throw new Error("Retriever test failed. Check your OPENAI_API_KEY");
    }
    
    app.listen(PORT, () => {
      console.log(`\n✅ Server running successfully!`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`📤 Upload PDFs: POST http://localhost:${PORT}/ingest`);
      console.log(`💬 Ask questions: POST http://localhost:${PORT}/chat`);
      console.log(`📊 Available graphs: GET http://localhost:${PORT}/graphs`);
      console.log(`\n🎯 Ready to process PDFs and answer questions!`);
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("❌ Failed to start server:", errorMessage);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Gracefully shutting down server...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Gracefully shutting down server...");
  process.exit(0);
});

// Start the server
startServer();
