'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Upload, Send, FileText, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  sources?: Array<{
    filename: string;
    chunkIndex?: number;
    content: string;
    relevanceScore?: number;
  }>;
}

interface UploadStatus {
  status: 'idle' | 'uploading' | 'success' | 'error';
  message: string;
  filesProcessed?: string[];
  totalChunks?: number;
}

interface UploadResponse {
  success: boolean;
  message?: string;
  error?: string;
  details?: {
    filesProcessed: number;
    totalChunks: number;
    processedFiles: string[];
  };
}

interface StreamData {
  type: string;
  data: string | Array<{
    filename: string;
    chunkIndex?: number;
    content: string;
    relevanceScore?: number;
  }>;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    status: 'idle',
    message: 'No files uploaded yet. Upload PDFs to start chatting!',
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // File upload with drag & drop
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    console.log('Files dropped:', acceptedFiles);
    
    const pdfFiles = acceptedFiles.filter(file => file.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
      setUploadStatus({
        status: 'error',
        message: 'Please upload only PDF files.',
      });
      return;
    }

    // Check file sizes
    const oversizedFiles = pdfFiles.filter(file => file.size > 10 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      setUploadStatus({
        status: 'error',
        message: `Files too large: ${oversizedFiles.map(f => f.name).join(', ')}. Maximum size is 10MB per file.`,
      });
      return;
    }

    setUploadStatus({
      status: 'uploading',
      message: `Uploading ${pdfFiles.length} PDF file(s)...`,
    });

    try {
      const formData = new FormData();
      pdfFiles.forEach(file => {
        formData.append('files', file);
      });

      console.log('Sending request to backend...');

      // ✅ FIXED: Added /ingest endpoint
      const response = await axios.post<UploadResponse>('https://ai-pdf-chatbot-backend-hjfo.onrender.com/ingest', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000,
      });

      console.log('Backend response:', response.data);

      if (response.data.success) {
        setUploadStatus({
          status: 'success',
          message: `✅ Successfully processed ${response.data.details?.filesProcessed} files (${response.data.details?.totalChunks} chunks)`,
          filesProcessed: response.data.details?.processedFiles,
          totalChunks: response.data.details?.totalChunks,
        });
      } else {
        setUploadStatus({
          status: 'error',
          message: `❌ Upload failed: ${response.data.error}`,
        });
      }
    } catch (error: unknown) {
      console.error('Upload error details:', error);
      
      let errorMessage = 'Unknown error occurred';
      
      if (axios.isAxiosError(error)) {
        if (error.response) {
          errorMessage = error.response.data?.error || `Server error: ${error.response.status}`;
          console.log('Server error response:', error.response.data);
        } else if (error.request) {
          errorMessage = 'No response from server. Check if backend is running.';
        } else {
          errorMessage = error.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setUploadStatus({
        status: 'error',
        message: `❌ Upload failed: ${errorMessage}`,
      });
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxFiles: 5,
  });

  // Send chat message with streaming
  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // ✅ FIXED: Added /chat endpoint
      const response = await fetch('https://ai-pdf-chatbot-backend-hjfo.onrender.com/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: inputValue.trim() }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: '',
        sources: [],
      };

      setMessages(prev => [...prev, aiMessage]);

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '' || line === 'data: [DONE]') continue;
          
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6);
              const data: StreamData = JSON.parse(jsonStr);

              if (data.type === 'answer_chunk') {
                setMessages(prev => {
                  const updated = [...prev];
                  const lastMessage = updated[updated.length - 1];
                  if (lastMessage && lastMessage.type === 'ai') {
                    lastMessage.content += data.data as string;
                  }
                  return updated;
                });
              } else if (data.type === 'sources') {
                setMessages(prev => {
                  const updated = [...prev];
                  const lastMessage = updated[updated.length - 1];
                  if (lastMessage && lastMessage.type === 'ai') {
                    lastMessage.sources = data.data as Array<{
                      filename: string;
                      chunkIndex?: number;
                      content: string;
                      relevanceScore?: number;
                    }>;
                  }
                  return updated;
                });
              } else if (data.type === 'error') {
                throw new Error(data.data as string);
              }
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError);
            }
          }
        }
      }
    } catch (error: unknown) {
      console.error('Chat error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      const errorResponse: Message = {
        id: (Date.now() + 2).toString(),
        type: 'ai',
        content: `❌ Sorry, I encountered an error: ${errorMessage}. Please try again.`,
      };
      setMessages(prev => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            AI PDF Chatbot
          </h1>
          <p className="text-gray-600 mt-1">Upload PDFs and ask questions about their content</p>
        </div>
      </header>

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
        {/* Upload Area */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            Upload PDFs
          </h2>
          
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}
              ${uploadStatus.status === 'uploading' ? 'pointer-events-none opacity-50' : ''}
            `}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            
            {uploadStatus.status === 'uploading' ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <span className="text-blue-600">Processing PDFs...</span>
              </div>
            ) : (
              <>
                <p className="text-lg text-gray-600 mb-2">
                  {isDragActive ? 'Drop PDFs here...' : 'Drag & drop PDFs here, or click to select'}
                </p>
                <p className="text-sm text-gray-500">
                  Maximum 5 files, 10MB each
                </p>
              </>
            )}
          </div>

          {/* Upload Status */}
          <div className={`mt-4 p-3 rounded-lg flex items-start gap-2 ${
            uploadStatus.status === 'success' ? 'bg-green-50 border border-green-200' :
            uploadStatus.status === 'error' ? 'bg-red-50 border border-red-200' :
            'bg-gray-50 border border-gray-200'
          }`}>
            {uploadStatus.status === 'success' && <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />}
            {uploadStatus.status === 'error' && <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />}
            {uploadStatus.status === 'uploading' && <Loader2 className="h-5 w-5 text-blue-600 animate-spin flex-shrink-0 mt-0.5" />}
            
            <div className="flex-1">
              <p className={`text-sm ${
                uploadStatus.status === 'success' ? 'text-green-800' :
                uploadStatus.status === 'error' ? 'text-red-800' :
                uploadStatus.status === 'uploading' ? 'text-blue-800' :
                'text-gray-600'
              }`}>
                {uploadStatus.message}
              </p>
              
              {uploadStatus.filesProcessed && uploadStatus.filesProcessed.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-green-700 font-medium">Processed files:</p>
                  <ul className="text-xs text-green-600 mt-1">
                    {uploadStatus.filesProcessed.map((file, index) => (
                      <li key={index}>• {file}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="bg-white rounded-lg shadow-sm border flex-1 flex flex-col">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              💬 Chat with your documents
            </h2>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🤖</div>
                <p className="text-gray-500">Upload some PDFs and start asking questions!</p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg p-3 ${
                    message.type === 'user' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    
                    {/* Sources */}
                    {message.sources && message.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-sm font-medium text-gray-600 mb-2">📄 Sources:</p>
                        <div className="space-y-2">
                          {message.sources.map((source, index) => (
                            <div key={index} className="text-xs bg-white p-2 rounded border">
                              <p className="font-medium text-blue-600">{source.filename}</p>
                              <p className="text-gray-600 mt-1">{source.content}</p>
                              {source.relevanceScore && (
                                <p className="text-gray-500 mt-1">
                                  Relevance: {Math.round(source.relevanceScore * 100)}%
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span className="text-gray-600">AI is thinking...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask a question about your uploaded PDFs..."
                className="flex-1 resize-none border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={1}
                disabled={isLoading || uploadStatus.status !== 'success'}
              />
              <button
                onClick={sendMessage}
                disabled={!inputValue.trim() || isLoading || uploadStatus.status !== 'success'}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
