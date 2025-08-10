import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  },

  // Supabase Configuration
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    tableName: process.env.SUPABASE_TABLE_NAME || 'documents',
  },

  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || '2024'),
  },

  // Document Processing Configuration
  documents: {
    chunkSize: parseInt(process.env.CHUNK_SIZE || '1000'),
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200'),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB in bytes
  },

  // Retrieval Configuration
  retrieval: {
    k: parseInt(process.env.RETRIEVAL_K || '6'), // Number of documents to retrieve
    similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.5'),
  },
};

// Validate required environment variables
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
