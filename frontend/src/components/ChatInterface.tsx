'use client';

import React, { useState, useRef, useEffect } from 'react';
import styles from './ChatInterface.module.css';

interface Source {
  filename: string;
  chunkIndex?: number;
  content: string;
  relevanceScore?: number;
}

interface Message {
  type: 'user' | 'ai';
  content: string;
  sources?: Source[];
  timestamp: Date;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim() || isLoading) return;

    const userQuestion = inputValue.trim();
    setInputValue('');
    setIsLoading(true);

    // Add user message
    const userMessage: Message = {
      type: 'user',
      content: userQuestion,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      console.log('Sending chat request:', userQuestion);
      
      // Send request to backend chat endpoint
      const response = await fetch('/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: userQuestion
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      let aiResponse = '';
      let sources: Source[] = [];
      
      // Add initial AI message
      const aiMessage: Message = {
        type: 'ai',
        content: '',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);

      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        
        // Check if chunk contains sources information
        if (chunk.includes('**Sources:**')) {
          const parts = chunk.split('**Sources:**');
          if (parts[0]) {
            aiResponse += parts[0];
          }
          // Parse sources from the remaining content
          if (parts[1]) {
            const sourceLines = parts[1].split('\n').filter(line => line.trim());
            sources = sourceLines.map((line, index) => {
              const match = line.match(/\d+\.\s*(.+?)\s*\(Relevance:\s*(\d+)%\)/);
              if (match) {
                return {
                  filename: match[1],
                  content: `Source ${index + 1}`,
                  relevanceScore: parseInt(match[2]) / 100
                };
              }
              return {
                filename: line.trim(),
                content: `Source ${index + 1}`,
                relevanceScore: 0.8
              };
            });
          }
        } else if (!chunk.includes('--- Response Complete ---')) {
          aiResponse += chunk;
        }
        
        // Update the AI message with accumulated content
        setMessages(prev => prev.map((msg, index) => 
          index === prev.length - 1 && msg.type === 'ai' 
            ? { ...msg, content: aiResponse, sources }
            : msg
        ));
      }

    } catch (error) {
      console.error('Chat error:', error);
      
      // Add error message
      const errorMessage: Message = {
        type: 'ai',
        content: `Sorry, I encountered an error while processing your question: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.chatContainer}>
      <div className={styles.chatWrapper}>
        {/* Header */}
        <div className={styles.chatHeader}>
          <h2 className={styles.chatTitle}>💬 Chat with Your Documents</h2>
          <p className={styles.chatSubtitle}>Ask questions about your uploaded PDFs</p>
        </div>

        {/* Messages Container */}
        <div className={styles.messagesContainer}>
          {messages.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🤖</div>
              <p className={styles.emptyTitle}>Ready to answer your questions!</p>
              <p className={styles.emptySubtitle}>Upload some PDFs and start asking questions about their content.</p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div key={index} className={`${styles.messageWrapper} ${message.type === 'user' ? styles.userMessage : styles.aiMessage}`}>
                <div className={`${styles.messageBubble} ${message.type === 'user' ? styles.userBubble : styles.aiBubble}`}>
                  <div className={styles.messageContent}>{message.content}</div>
                  
                  {message.sources && message.sources.length > 0 && (
                    <div className={styles.sourcesContainer}>
                      <div className={styles.sourcesTitle}>📚 Sources:</div>
                      <div className={styles.sourcesList}>
                        {message.sources.map((source, idx) => (
                          <div key={idx} className={styles.sourceItem}>
                            <span className={styles.sourceFilename}>{source.filename}</span>
                            {source.relevanceScore && (
                              <span className={styles.sourceRelevance}>
                                ({Math.round(source.relevanceScore * 100)}% relevant)
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className={styles.messageTimestamp}>
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))
          )}
          
          {isLoading && (
            <div className={`${styles.messageWrapper} ${styles.aiMessage}`}>
              <div className={`${styles.messageBubble} ${styles.aiBubble}`}>
                <div className={styles.loadingContainer}>
                  <div className={styles.loadingSpinner}></div>
                  <span>Thinking...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <div className={styles.inputContainer}>
          <form onSubmit={handleSubmit} className={styles.inputForm}>
            <label htmlFor="chat-input" className={styles.visuallyHidden}>
              Ask a question about your documents
            </label>
            <input
              type="text"
              id="chat-input"
              name="question"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask a question about your documents..."
              className={styles.chatInput}
              disabled={isLoading}
              title="Type your question here"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className={styles.sendButton}
              title={isLoading ? 'Processing...' : 'Send message'}
            >
              {isLoading ? '...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
