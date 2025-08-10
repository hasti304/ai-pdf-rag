import { Annotation, StateGraph, END } from "@langchain/langgraph";
import { processPDFFile } from "../shared/documents.js";
import { addDocumentsToVectorStore } from "../shared/retriever.js";

// Define the state using Annotation with proper reducer configuration
const IngestionState = Annotation.Root({
  files: Annotation<Array<{ filename: string; buffer: Buffer; size: number }>>(),
  processedFiles: Annotation<string[]>({
    value: (left: string[], right: string[]) => [...left, ...right],
    default: () => [],
  }),
  totalChunks: Annotation<number>({
    value: (left: number, right: number) => right, // Use latest value
    default: () => 0,
  }),
  errors: Annotation<string[]>({
    value: (left: string[], right: string[]) => [...left, ...right],
    default: () => [],
  }),
  status: Annotation<"pending" | "processing" | "completed" | "failed">({
    value: (left, right) => right, // Use latest value
    default: () => "pending" as const,
  }),
  message: Annotation<string>({
    value: (left: string, right: string) => right, // Use latest value
    default: () => "",
  }),
  documents: Annotation<any[]>({
    value: (left: any[], right: any[]) => [...left, ...right],
    default: () => [],
  }),
});

type IngestionStateType = typeof IngestionState.State;

// Node 1: Validate uploaded files
async function validateFiles(state: IngestionStateType): Promise<Partial<IngestionStateType>> {
  console.log("🔍 Validating uploaded files...");
  
  try {
    const errors: string[] = [];
    
    // Check if any files were provided
    if (!state.files || state.files.length === 0) {
      errors.push("No files provided for processing");
    } else {
      // Validate each file
      state.files.forEach((file: any, index: number) => {
        try {
          // Check file size
          if (file.size > 10 * 1024 * 1024) { // 10MB limit
            errors.push(`File "${file.filename}" exceeds 10MB size limit`);
          }
          
          // Check file extension
          if (!file.filename.toLowerCase().endsWith('.pdf')) {
            errors.push(`File "${file.filename}" is not a PDF file`);
          }
          
          // Check PDF signature
          const pdfSignature = file.buffer.slice(0, 4).toString();
          if (pdfSignature !== '%PDF') {
            errors.push(`File "${file.filename}" does not appear to be a valid PDF`);
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Error validating file "${file.filename}": ${errorMessage}`);
        }
      });
    }
    
    if (errors.length > 0) {
      console.log(`❌ Validation failed with ${errors.length} errors`);
      return {
        status: "failed",
        errors: errors,
        message: `Validation failed: ${errors.join(", ")}`,
      };
    }
    
    console.log(`✅ All ${state.files.length} files passed validation`);
    return {
      status: "processing",
      message: `Validated ${state.files.length} files successfully`,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("❌ Error in file validation:", errorMessage);
    return {
      status: "failed",
      errors: [`Validation error: ${errorMessage}`],
      message: "File validation failed",
    };
  }
}

// Node 2: Process PDFs into document chunks
async function processPDFs(state: IngestionStateType): Promise<Partial<IngestionStateType>> {
  console.log("📄 Processing PDFs into document chunks...");
  
  try {
    const allDocuments: any[] = [];
    const processedFiles: string[] = [];
    const errors: string[] = [];
    
    for (const file of state.files) {
      try {
        console.log(`Processing: ${file.filename}`);
        
        // Process the PDF file into chunks
        const documents = await processPDFFile(
          file.buffer,
          file.filename,
          {
            uploadedAt: new Date().toISOString(),
            fileSize: file.size,
          }
        );
        
        allDocuments.push(...documents);
        processedFiles.push(file.filename);
        
        console.log(`✅ Processed ${file.filename}: ${documents.length} chunks created`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ Error processing ${file.filename}:`, errorMessage);
        errors.push(`Failed to process "${file.filename}": ${errorMessage}`);
      }
    }
    
    if (allDocuments.length === 0) {
      return {
        status: "failed",
        errors: errors,
        message: "No documents were successfully processed",
      };
    }
    
    // Store documents in state for next step
    return {
      processedFiles: processedFiles,
      totalChunks: allDocuments.length,
      errors: errors,
      documents: allDocuments,
      message: `Processed ${processedFiles.length} files into ${allDocuments.length} chunks`,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("❌ Error in PDF processing:", errorMessage);
    return {
      status: "failed",
      errors: [`PDF processing error: ${errorMessage}`],
      message: "PDF processing failed",
    };
  }
}

// Node 3: Store embeddings in vector database
async function storeEmbeddings(state: IngestionStateType): Promise<Partial<IngestionStateType>> {
  console.log("🔄 Generating embeddings and storing in vector database...");
  
  try {
    // Get documents from state
    const documents = state.documents;
    
    if (!documents || documents.length === 0) {
      throw new Error("No documents to store");
    }
    
    // Add documents to vector store (this will generate embeddings automatically)
    await addDocumentsToVectorStore(documents);
    
    console.log(`✅ Successfully stored ${documents.length} document chunks with embeddings`);
    
    return {
      status: "completed",
      message: `Successfully processed and stored ${state.processedFiles.length} files (${documents.length} chunks) in vector database`,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("❌ Error storing embeddings:", errorMessage);
    return {
      status: "failed",
      errors: [`Embedding storage error: ${errorMessage}`],
      message: "Failed to store embeddings in vector database",
    };
  }
}

// Node 4: Handle completion
async function handleCompletion(state: IngestionStateType): Promise<Partial<IngestionStateType>> {
  if (state.status === "completed") {
    console.log("🎉 Ingestion process completed successfully!");
    return {
      message: `✅ Ingestion completed: ${state.processedFiles.length} files processed, ${state.totalChunks} chunks stored`,
    };
  } else {
    console.log("❌ Ingestion process failed");
    return {
      message: `❌ Ingestion failed: ${state.errors.join(", ")}`,
    };
  }
}

// Create the ingestion graph using Annotation
const ingestionGraph = new StateGraph(IngestionState)
  .addNode("validate_files", validateFiles)
  .addNode("process_pdfs", processPDFs)
  .addNode("store_embeddings", storeEmbeddings)
  .addNode("handle_completion", handleCompletion)
  .addEdge("__start__", "validate_files")
  .addConditionalEdges(
    "validate_files",
    (state: IngestionStateType) => state.status === "failed" ? "handle_completion" : "process_pdfs"
  )
  .addConditionalEdges(
    "process_pdfs",
    (state: IngestionStateType) => state.totalChunks > 0 ? "store_embeddings" : "handle_completion"
  )
  .addEdge("store_embeddings", "handle_completion")
  .addEdge("handle_completion", END);

// Compile the graph
export const compiledIngestionGraph = ingestionGraph.compile();

// Helper function to run ingestion
export async function runIngestion(files: Array<{ filename: string; buffer: Buffer; size: number }>) {
  console.log("🚀 Starting PDF ingestion process...");
  
  try {
    const initialState = {
      files,
      processedFiles: [],
      totalChunks: 0,
      errors: [],
      status: "pending" as const,
      message: "Starting ingestion process...",
      documents: [],
    };
    
    const result = await compiledIngestionGraph.invoke(initialState);
    
    console.log("📊 Ingestion process summary:");
    console.log(`   Status: ${result.status}`);
    console.log(`   Files processed: ${result.processedFiles?.length || 0}`);
    console.log(`   Total chunks: ${result.totalChunks}`);
    console.log(`   Errors: ${result.errors?.length || 0}`);
    
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("❌ Ingestion process failed:", errorMessage);
    throw new Error(errorMessage);
  }
}
