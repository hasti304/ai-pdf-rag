import { Annotation, StateGraph, END } from "@langchain/langgraph";
import { processPDFFile } from "../shared/documents.js";
import { addDocumentsToVectorStore } from "../shared/retriever.js";

// Define state using Annotation instead of Zod
const IngestionState = Annotation.Root({
  files: Annotation<Array<{ buffer: Buffer; filename: string }>>({
    value: (left: Array<{ buffer: Buffer; filename: string }>, right: Array<{ buffer: Buffer; filename: string }>) => [...left, ...right],
    default: () => [],
  }),
  processedFiles: Annotation<string[]>({
    value: (left: string[], right: string[]) => [...left, ...right],
    default: () => [],
  }),
  totalChunks: Annotation<number>({
    value: (left: number, right: number) => left + right,
    default: () => 0,
  }),
  status: Annotation<"pending" | "processing" | "completed" | "failed">({
    value: (left: "pending" | "processing" | "completed" | "failed", right: "pending" | "processing" | "completed" | "failed") => right,
    default: () => "pending" as const,
  }),
  error: Annotation<string>({
    value: (left: string, right: string) => right,
    default: () => "",
  }),
});

type IngestionStateType = typeof IngestionState.State;

// Node 1: Validate and prepare files
async function validateFiles(state: IngestionStateType): Promise<Partial<IngestionStateType>> {
  console.log(`📋 Validating ${state.files.length} files...`);
  
  if (state.files.length === 0) {
    return {
      status: "failed",
      error: "No files provided for ingestion",
    };
  }

  // Basic file validation
  const invalidFiles: string[] = [];
  
  for (const file of state.files) {
    if (!file.buffer || file.buffer.length === 0) {
      invalidFiles.push(`${file.filename}: Empty or invalid buffer`);
    }
    
    if (!file.filename.toLowerCase().endsWith('.pdf')) {
      invalidFiles.push(`${file.filename}: Not a PDF file`);
    }
  }

  if (invalidFiles.length > 0) {
    return {
      status: "failed",
      error: `Invalid files detected: ${invalidFiles.join(', ')}`,
    };
  }

  console.log(`✅ All ${state.files.length} files validated successfully`);
  
  return {
    status: "processing",
  };
}

// Node 2: Process PDF files
async function processPDFs(state: IngestionStateType): Promise<Partial<IngestionStateType>> {
  console.log(`🔄 Processing ${state.files.length} PDF files...`);
  
  const processedFiles: string[] = [];
  let totalChunks = 0;
  
  try {
    for (const file of state.files) {
      console.log(`📄 Processing: ${file.filename}`);
      
      // Check if buffer appears to be a valid PDF
      const pdfHeader = file.buffer.subarray(0, 4).toString('ascii');
      if (!pdfHeader.startsWith('%PDF')) {
        throw new Error(`File "${file.filename}" does not appear to be a valid PDF`);
      }
      
      // Process the PDF file
      const documents = await processPDFFile(
        file.buffer,
        file.filename,
        {
          uploadedAt: new Date().toISOString(),
          source: 'upload',
        }
      );
      
      if (documents.length === 0) {
        throw new Error(`No content could be extracted from ${file.filename}`);
      }
      
      // Store documents in vector store
      await addDocumentsToVectorStore(documents);
      
      processedFiles.push(file.filename);
      totalChunks += documents.length;
      
      console.log(`✅ Successfully processed ${file.filename} (${documents.length} chunks)`);
    }
    
    return {
      processedFiles,
      totalChunks,
      status: "completed",
    };
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error processing PDFs:', errorMessage);
    
    return {
      processedFiles,
      totalChunks,
      status: "failed",
      error: `❌ Ingestion failed: ${errorMessage}`,
    };
  }
}

// Node 3: Finalize ingestion
async function finalizeIngestion(state: IngestionStateType): Promise<Partial<IngestionStateType>> {
  if (state.status === "failed") {
    console.log(`❌ Ingestion failed: ${state.error}`);
    return {};
  }
  
  if (state.status === "completed") {
    console.log(`✅ Ingestion completed successfully!`);
    console.log(`   Files processed: ${state.processedFiles.length}`);
    console.log(`   Total chunks created: ${state.totalChunks}`);
    console.log(`   Files: ${state.processedFiles.join(', ')}`);
  }
  
  return {};
}

// Create the ingestion graph using Annotation
const ingestionGraph = new StateGraph(IngestionState)
  .addNode("validate_files", validateFiles)
  .addNode("process_pdfs", processPDFs)
  .addNode("finalize", finalizeIngestion)
  .addEdge("__start__", "validate_files")
  .addConditionalEdges(
    "validate_files",
    (state: IngestionStateType) => {
      if (state.status === "failed") return "finalize";
      return "process_pdfs";
    }
  )
  .addEdge("process_pdfs", "finalize")
  .addEdge("finalize", END);

// Compile the graph
export const compiledIngestionGraph = ingestionGraph.compile();

// Helper function to run the ingestion process
export async function runIngestion(files: Array<{ buffer: Buffer; filename: string }>) {
  console.log('🚀 Starting ingestion process...');
  
  const initialState = {
    files,
    processedFiles: [],
    totalChunks: 0,
    status: "pending" as const,
    error: "",
  };
  
  const result = await compiledIngestionGraph.invoke(initialState);
  
  console.log('📊 Ingestion process summary:');
  console.log(`   Status: ${result.status}`);
  console.log(`   Files processed: ${result.processedFiles.length}`);
  console.log(`   Total chunks: ${result.totalChunks}`);
  
  return result;
}
