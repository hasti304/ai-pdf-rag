import { Annotation, StateGraph, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { searchDocuments } from "../shared/retriever.js";
import { config } from "../shared/config.js";

// Define the state using Annotation instead of Zod
const RetrievalState = Annotation.Root({
  question: Annotation<string>(),
  retrievedDocuments: Annotation<Array<{
    content: string;
    metadata: Record<string, any>;
    score?: number;
  }>>({
    value: (left: Array<{content: string; metadata: Record<string, any>; score?: number}>, right: Array<{content: string; metadata: Record<string, any>; score?: number}>) => [...left, ...right],
    default: () => [],
  }),
  answer: Annotation<string>({
    value: (left: string, right: string) => right, // Use latest value
    default: () => "",
  }),
  sources: Annotation<Array<{
    filename: string;
    chunkIndex?: number;
    content: string;
    relevanceScore?: number;
  }>>({
    value: (left: Array<{filename: string; chunkIndex?: number; content: string; relevanceScore?: number}>, right: Array<{filename: string; chunkIndex?: number; content: string; relevanceScore?: number}>) => [...left, ...right],
    default: () => [],
  }),
  status: Annotation<"pending" | "retrieving" | "generating" | "completed" | "failed">({
    value: (left: "pending" | "retrieving" | "generating" | "completed" | "failed", right: "pending" | "retrieving" | "generating" | "completed" | "failed") => right, // Use latest value
    default: () => "pending" as const,
  }),
  error: Annotation<string>({
    value: (left: string, right: string) => right, // Use latest value
    default: () => "",
  }),
});

type RetrievalStateType = typeof RetrievalState.State;

// Initialize OpenAI chat model
const chatModel = new ChatOpenAI({
  openAIApiKey: config.openai.apiKey,
  modelName: config.openai.model,
  temperature: 0.1,
  streaming: true,
});

// Create the RAG prompt template
const RAG_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a helpful AI assistant that answers questions based on provided document context.

INSTRUCTIONS:
1. Use ONLY the provided context to answer questions
2. If the context doesn't contain enough information, say so clearly
3. Always cite your sources using [Source: filename] format
4. Be concise but comprehensive
5. If asked about something not in the context, politely decline

CONTEXT FORMAT:
Each piece of context includes:
- Content: The actual text from the document
- Source: filename and chunk information

Your answer should be helpful, accurate, and well-cited.`,
  ],
  [
    "human",
    `Context from documents:
{context}

Question: {question}

Please provide a detailed answer based on the context above, and cite your sources.`,
  ],
]);

// Node 1: Retrieve relevant documents
async function retrieveDocuments(state: RetrievalStateType): Promise<Partial<RetrievalStateType>> {
  console.log(`🔍 Retrieving documents for question: "${state.question}"`);
  
  try {
    // Search for relevant documents
    const documents = await searchDocuments(state.question, config.retrieval.k);
    
    if (documents.length === 0) {
      console.log("⚠️  No relevant documents found");
      return {
        status: "completed",
        answer: "I couldn't find any relevant information in the uploaded documents to answer your question. Please make sure you've uploaded relevant PDFs or try rephrasing your question.",
        sources: [],
      };
    }
    
    // Format retrieved documents
    const retrievedDocuments = documents.map((doc: any, index: number) => ({
      content: doc.pageContent,
      metadata: doc.metadata || {},
      score: (doc.metadata as any)?.score || 0.8,
    }));
    
    console.log(`✅ Retrieved ${documents.length} relevant documents`);
    
    return {
      status: "generating",
      retrievedDocuments: retrievedDocuments,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("❌ Error retrieving documents:", errorMessage);
    return {
      status: "failed",
      error: `Document retrieval failed: ${errorMessage}`,
    };
  }
}

// Node 2: Generate AI response
async function generateResponse(state: RetrievalStateType): Promise<Partial<RetrievalStateType>> {
  console.log("🤖 Generating AI response...");
  
  try {
    // Format context from retrieved documents
    const context = state.retrievedDocuments
      .map((doc: any, index: number) => {
        const filename = doc.metadata.filename || `Document ${index + 1}`;
        const chunkIndex = doc.metadata.chunkIndex || 0;
        
        return `--- Source: ${filename} (Chunk ${chunkIndex + 1}) ---
${doc.content}`;
      })
      .join("\n\n");
    
    if (!context.trim()) {
      throw new Error("No context available for response generation");
    }
    
    // Generate response using the RAG prompt
    const prompt = await RAG_PROMPT.format({
      context,
      question: state.question,
    });
    
    const response = await chatModel.invoke(prompt);
    const answer = response.content as string;
    
    // Extract and format sources
    const sources = state.retrievedDocuments.map((doc: any, index: number) => ({
      filename: doc.metadata.filename || `Document ${index + 1}`,
      chunkIndex: doc.metadata.chunkIndex || index,
      content: doc.content.substring(0, 200) + "...",
      relevanceScore: doc.score || 0.8,
    }));
    
    console.log(`✅ Generated response (${answer.length} characters)`);
    
    return {
      status: "completed",
      answer: answer,
      sources: sources,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("❌ Error generating response:", errorMessage);
    return {
      status: "failed",
      error: `Response generation failed: ${errorMessage}`,
    };
  }
}

// Node 3: Handle completion or errors
async function handleCompletion(state: RetrievalStateType): Promise<Partial<RetrievalStateType>> {
  if (state.status === "failed") {
    console.log("❌ Retrieval process failed");
    return {
      answer: `I apologize, but I encountered an error while processing your question: ${state.error}. Please try again or contact support if the issue persists.`,
      sources: [],
    };
  }
  
  if (state.status === "completed") {
    console.log("✅ Retrieval process completed successfully");
    console.log(`   Question: ${state.question}`);
    console.log(`   Sources used: ${state.sources.length}`);
    console.log(`   Answer length: ${state.answer.length} characters`);
  }
  
  return {};
}

// Create the retrieval graph using Annotation
const retrievalGraph = new StateGraph(RetrievalState)
  .addNode("retrieve_documents", retrieveDocuments)
  .addNode("generate_response", generateResponse)
  .addNode("handle_completion", handleCompletion)
  .addEdge("__start__", "retrieve_documents")
  .addConditionalEdges(
    "retrieve_documents",
    (state: RetrievalStateType) => {
      if (state.status === "failed") return "handle_completion";
      if (state.status === "completed") return "handle_completion";
      return "generate_response";
    }
  )
  .addEdge("generate_response", "handle_completion")
  .addEdge("handle_completion", END);

// Compile the graph
export const compiledRetrievalGraph = retrievalGraph.compile();

// Helper function to run retrieval and get streaming response
export async function* runRetrieval(question: string) {
  console.log("🚀 Starting retrieval process for question...");
  
  try {
    const initialState = {
      question,
      retrievedDocuments: [],
      answer: "",
      sources: [],
      status: "pending" as const,
      error: "",
    };
    
    yield { type: "status", data: "Searching documents..." };
    
    const result = await compiledRetrievalGraph.invoke(initialState);
    
    if (result.status === "failed") {
      yield { type: "error", data: result.error || "Unknown error occurred" };
      return;
    }
    
    yield { type: "answer_start", data: "" };
    
    const answer = result.answer || "";
    const chunkSize = 50;
    
    for (let i = 0; i < answer.length; i += chunkSize) {
      const chunk = answer.slice(i, i + chunkSize);
      yield { type: "answer_chunk", data: chunk };
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    yield { type: "answer_complete", data: "" };
    yield { type: "sources", data: result.sources || [] };
    yield { type: "complete", data: "Response generated successfully" };
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("❌ Retrieval process failed:", errorMessage);
    yield { type: "error", data: errorMessage };
  }
}

// Simple non-streaming version for testing
export async function runRetrievalSimple(question: string) {
  console.log("🚀 Starting simple retrieval process...");
  
  const initialState = {
    question,
    retrievedDocuments: [],
    answer: "",
    sources: [],
    status: "pending" as const,
    error: "",
  };
  
  const result = await compiledRetrievalGraph.invoke(initialState);
  
  console.log("📊 Retrieval process summary:");
  console.log(`   Status: ${result.status}`);
  console.log(`   Documents retrieved: ${result.retrievedDocuments?.length || 0}`);
  console.log(`   Sources: ${result.sources?.length || 0}`);
  
  return result;
}
  