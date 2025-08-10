import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "@langchain/core/documents";
import { config } from './config.js';

// Process PDF file into document chunks
export async function processPDFFile(
  buffer: Buffer,
  filename: string,
  metadata: Record<string, any> = {}
): Promise<Document[]> {
  try {
    console.log(`📄 Processing PDF: ${filename}`);

    // Convert Buffer to Uint8Array to ensure proper Blob construction
    const uint8Array = new Uint8Array(buffer);
    
    // Create Blob from Uint8Array instead of Buffer directly
    const blob = new Blob([uint8Array], { type: 'application/pdf' });
    const file = new File([blob], filename, { type: 'application/pdf' });

    // Load PDF using LangChain's PDFLoader
    const loader = new PDFLoader(file);
    const docs = await loader.load();

    if (!docs || docs.length === 0) {
      throw new Error(`No content extracted from PDF: ${filename}`);
    }

    console.log(`📑 Extracted ${docs.length} pages from ${filename}`);

    // Configure text splitter
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: config.documents.chunkSize,
      chunkOverlap: config.documents.chunkOverlap,
      separators: ["\n\n", "\n", " ", ""],
    });

    // Split documents into chunks
    const splitDocs = await textSplitter.splitDocuments(docs);

    // Add metadata to each chunk
    const processedDocs = splitDocs.map((doc, index) => {
      return new Document({
        pageContent: doc.pageContent,
        metadata: {
          ...doc.metadata,
          ...metadata,
          filename,
          chunkIndex: index,
          totalChunks: splitDocs.length,
          processedAt: new Date().toISOString(),
        },
      });
    });

    console.log(`✂️  Split into ${processedDocs.length} chunks`);
    return processedDocs;

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error processing PDF ${filename}:`, errorMessage);
    throw new Error(`Failed to process PDF ${filename}: ${errorMessage}`);
  }
}

// Extract text content from Buffer (fallback method)
export async function extractTextFromBuffer(buffer: Buffer): Promise<string> {
  try {
    // This is a simplified text extraction - in production you might want to use pdf-parse
    const text = buffer.toString('utf8');
    return text;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error extracting text from buffer:', errorMessage);
    throw new Error(`Text extraction failed: ${errorMessage}`);
  }
}
