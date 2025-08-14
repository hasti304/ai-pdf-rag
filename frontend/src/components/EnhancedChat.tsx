import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage, ChatSession, ChatBookmark, DocumentSource, QueryAnalysis } from '../types/chatTypes';
import ChatHistory from './ChatHistory';
import AdvancedSearch from './AdvancedSearch';
import MessageBookmarks from './MessageBookmarks';
import '../styles/enhanced-chat.css';

interface EnhancedChatProps {
  apiEndpoint: string;
}

const EnhancedChat: React.FC<EnhancedChatProps> = ({ apiEndpoint }) => {
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [bookmarks, setBookmarks] = useState<ChatBookmark[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showBookmarksPanel, setShowBookmarksPanel] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentSession?.messages, streamingMessage]);

  // ✅ FIXED: Wrapped in useCallback to fix useEffect dependency warning
  const loadChatSessions = useCallback(async () => {
    try {
      // Load from localStorage first for immediate display
      const localSessions = localStorage.getItem('chatSessions');
      if (localSessions) {
        const parsedSessions = JSON.parse(localSessions);
        setSessions(parsedSessions);
        
        // Set current session to the most recent one
        if (parsedSessions.length > 0 && !currentSession) {
          setCurrentSession(parsedSessions[0]);
        }
      }

      // Then sync with API if available
      const response = await fetch(`${apiEndpoint}/chat/sessions`);
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Error loading chat sessions:', error);
    }
  }, [apiEndpoint, currentSession]);

  // ✅ FIXED: Wrapped in useCallback to fix useEffect dependency warning
  const loadBookmarks = useCallback(async () => {
    try {
      const localBookmarks = localStorage.getItem('chatBookmarks');
      if (localBookmarks) {
        setBookmarks(JSON.parse(localBookmarks));
      }

      const response = await fetch(`${apiEndpoint}/chat/bookmarks`);
      if (response.ok) {
        const data = await response.json();
        setBookmarks(data.bookmarks || []);
      }
    } catch (error) {
      console.error('Error loading bookmarks:', error);
    }
  }, [apiEndpoint]);

  // ✅ FIXED: Added missing dependencies
  useEffect(() => {
    loadChatSessions();
    loadBookmarks();
  }, [loadChatSessions, loadBookmarks]);

  // Create new chat session
  const createNewSession = () => {
    const newSession: ChatSession = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: 'New Chat',
      messages: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        messageCount: 0,
        avgResponseTime: 0,
        topics: [],
        bookmarked: false
      }
    };

    setCurrentSession(newSession);
    setSessions(prev => [newSession, ...prev]);
    setShowHistory(false);
  };

  // Save session to localStorage and API
  const saveSession = useCallback(async (session: ChatSession) => {
    try {
      // Save to localStorage immediately
      const updatedSessions = sessions.map(s => s.id === session.id ? session : s);
      if (!sessions.find(s => s.id === session.id)) {
        updatedSessions.unshift(session);
      }
      localStorage.setItem('chatSessions', JSON.stringify(updatedSessions));
      setSessions(updatedSessions);

      // Save to API
      await fetch(`${apiEndpoint}/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session)
      });
    } catch (error) {
      console.error('Error saving session:', error);
    }
  }, [sessions, apiEndpoint]);

  // Send message
  const sendMessage = async () => {
    if (!message.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'user',
      content: message.trim(),
      timestamp: new Date().toISOString()
    };

    // Create session if none exists
    let session = currentSession;
    if (!session) {
      session = {
        id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
        messages: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          messageCount: 0,
          avgResponseTime: 0,
          topics: [],
          bookmarked: false
        }
      };
      setCurrentSession(session);
    }

    // Add user message
    session.messages.push(userMessage);
    session.metadata.messageCount++;
    session.updated_at = new Date().toISOString();

    setCurrentSession({ ...session });
    setMessage('');
    setIsLoading(true);
    setStreamingMessage('');

    try {
      // Abort any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const startTime = Date.now();
      const response = await fetch(`${apiEndpoint}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMessage.content }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('Failed to get response');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      // ✅ FIXED: Changed 'let' to 'const' since sources is never reassigned
      const sources: DocumentSource[] = [];
      // ✅ FIXED: Added proper typing for queryAnalysis
      let queryAnalysis: QueryAnalysis | undefined;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.trim()) {
              if (line.includes('Query Analysis:')) {
                // Parse query analysis info
                try {
                  const analysisMatch = line.match(/Category: (\w+)/);
                  if (analysisMatch) {
                    queryAnalysis = {
                      category: analysisMatch[1],
                      complexity: 'medium',
                      confidence: 0.8,
                      keywords: [],
                      estimatedResponseTime: 5,
                      suggestedFollowups: []
                    };
                  }
                } catch (e) {
                  console.warn('Could not parse query analysis:', e);
                }
              } else if (line.includes('**Sources:**')) {
                // Parse sources - simplified version
              } else if (!line.includes('🔍') && !line.includes('**') && !line.includes('---')) {
                fullResponse += line + '\n';
                setStreamingMessage(fullResponse);
              }
            }
          }
        }
      }

      const responseTime = Date.now() - startTime;

      // Create assistant message
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'assistant',
        content: fullResponse.trim(),
        timestamp: new Date().toISOString(),
        metadata: {
          sources,
          queryAnalysis,
          responseTime,
          qualityScore: 0.8,
          cached: false
        }
      };

      // Add assistant message to session
      session.messages.push(assistantMessage);
      session.metadata.messageCount++;
      session.metadata.avgResponseTime = 
        (session.metadata.avgResponseTime * (session.metadata.messageCount - 1) + responseTime) / 
        session.metadata.messageCount;
      session.updated_at = new Date().toISOString();

      setCurrentSession({ ...session });
      await saveSession(session);

    } catch (error: unknown) { // ✅ FIXED: Replaced 'any' with 'unknown'
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error sending message:', error);
        
        // Add error message
        const errorMessage: ChatMessage = {
          id: `msg_${Date.now()}_error`,
          type: 'assistant',
          content: 'Sorry, I encountered an error while processing your request. Please try again.',
          timestamp: new Date().toISOString()
        };
        
        session.messages.push(errorMessage);
        setCurrentSession({ ...session });
      }
    } finally {
      setIsLoading(false);
      setStreamingMessage('');
      abortControllerRef.current = null;
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Bookmark message
  const bookmarkMessage = async (messageId: string) => {
    if (!currentSession) return;

    const messageToBookmark = currentSession.messages.find(m => m.id === messageId);
    if (!messageToBookmark) return;

    const bookmark: ChatBookmark = {
      id: `bookmark_${Date.now()}`,
      sessionId: currentSession.id,
      messageId,
      title: messageToBookmark.content.slice(0, 50) + (messageToBookmark.content.length > 50 ? '...' : ''),
      note: '',
      tags: [],
      created_at: new Date().toISOString()
    };

    setBookmarks(prev => [bookmark, ...prev]);
    localStorage.setItem('chatBookmarks', JSON.stringify([bookmark, ...bookmarks]));

    try {
      await fetch(`${apiEndpoint}/chat/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookmark)
      });
    } catch (error) {
      console.error('Error saving bookmark:', error);
    }
  };

  // Stop generation
  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
    setStreamingMessage('');
  };

  return (
    <div className="enhanced-chat">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-content">
          <div className="chat-title-section">
            <h1 className="chat-title">💬 AI Assistant</h1>
            {currentSession && (
              <span className="message-count">
                {currentSession.messages.length} messages
              </span>
            )}
          </div>
          
          <div className="chat-header-actions">
            <button
              type="button"
              onClick={() => setShowSearch(!showSearch)}
              className={`chat-header-btn ${showSearch ? 'active' : ''}`}
              title="Search messages"
            >
              🔍
            </button>
            <button
              type="button"
              onClick={() => setShowBookmarksPanel(!showBookmarksPanel)}
              className={`chat-header-btn ${showBookmarksPanel ? 'active' : ''}`}
              title="View bookmarks"
            >
              🔖 {bookmarks.length}
            </button>
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className={`chat-header-btn ${showHistory ? 'active' : ''}`}
              title="Chat history"
            >
              📚 {sessions.length}
            </button>
            <button
              type="button"
              onClick={createNewSession}
              className="chat-header-btn"
              title="New chat"
            >
              ➕
            </button>
          </div>
        </div>
      </div>

      <div className="chat-layout">
        {/* Sidebar */}
        {(showHistory || showSearch || showBookmarksPanel) && (
          <div className="chat-sidebar">
            {showHistory && (
              <ChatHistory
                sessions={sessions}
                currentSession={currentSession}
                onSessionSelect={setCurrentSession}
                onSessionDelete={(sessionId) => {
                  setSessions(prev => prev.filter(s => s.id !== sessionId));
                  if (currentSession?.id === sessionId) {
                    setCurrentSession(null);
                  }
                }}
              />
            )}
            
            {showSearch && (
              <AdvancedSearch
                sessions={sessions}
                bookmarks={bookmarks}
                onResultSelect={(result) => {
                  console.log('Selected result:', result);
                }}
              />
            )}
            
            {showBookmarksPanel && (
              <MessageBookmarks
                bookmarks={bookmarks}
                sessions={sessions}
                onBookmarkSelect={(bookmark) => {
                  const session = sessions.find(s => s.id === bookmark.sessionId);
                  if (session) {
                    setCurrentSession(session);
                  }
                }}
                onBookmarkDelete={(bookmarkId) => {
                  setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
                }}
              />
            )}
          </div>
        )}

        {/* Main Chat Area */}
        <div className="chat-main">
          <div className="chat-messages">
            {!currentSession || currentSession.messages.length === 0 ? (
              <div className="chat-welcome">
                <div className="welcome-icon">🤖</div>
                <h2 className="welcome-title">
                  Welcome to Enhanced AI Assistant
                </h2>
                <p className="welcome-description">
                  Ask me anything about your documents. I have advanced features like:
                </p>
                <div className="feature-grid">
                  <div className="feature-card">
                    <div className="feature-icon">📚</div>
                    <h3 className="feature-title">Chat History</h3>
                    <p className="feature-description">
                      Persistent conversations across sessions
                    </p>
                  </div>
                  <div className="feature-card">
                    <div className="feature-icon">🔍</div>
                    <h3 className="feature-title">Advanced Search</h3>
                    <p className="feature-description">
                      Find messages and information quickly
                    </p>
                  </div>
                  <div className="feature-card">
                    <div className="feature-icon">🔖</div>
                    <h3 className="feature-title">Bookmarks</h3>
                    <p className="feature-description">
                      Save important messages for later
                    </p>
                  </div>
                  <div className="feature-card">
                    <div className="feature-icon">🎯</div>
                    <h3 className="feature-title">Smart Suggestions</h3>
                    <p className="feature-description">
                      Get contextual follow-up questions
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {currentSession.messages.map((msg) => (
                  <div key={msg.id} className={`message ${msg.type}`}>
                    <div className="message-content">
                      <div className="message-header">
                        <div className="message-avatar">
                          {msg.type === 'user' ? '👤' : '🤖'}
                        </div>
                        <div className="message-info">
                          <span className="message-type">
                            {msg.type === 'user' ? 'You' : 'Assistant'}
                          </span>
                          <span className="message-time">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        {msg.type === 'assistant' && (
                          <button
                            type="button"
                            onClick={() => bookmarkMessage(msg.id)}
                            className="bookmark-btn"
                            title="Bookmark this message"
                          >
                            🔖
                          </button>
                        )}
                      </div>
                      
                      <div className="message-text">
                        {msg.content}
                      </div>
                      
                      {msg.metadata && (
                        <div className="message-metadata">
                          {msg.metadata.responseTime && (
                            <span className="metadata-item">
                              ⏱️ {(msg.metadata.responseTime / 1000).toFixed(1)}s
                            </span>
                          )}
                          {msg.metadata.qualityScore && (
                            <span className="metadata-item">
                              ⭐ {(msg.metadata.qualityScore * 100).toFixed(0)}%
                            </span>
                          )}
                          {msg.metadata.cached && (
                            <span className="metadata-item">⚡ Cached</span>
                          )}
                          {msg.metadata.sources && msg.metadata.sources.length > 0 && (
                            <span className="metadata-item">
                              📄 {msg.metadata.sources.length} sources
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {streamingMessage && (
                  <div className="message assistant streaming">
                    <div className="message-content">
                      <div className="message-header">
                        <div className="message-avatar">🤖</div>
                        <div className="message-info">
                          <span className="message-type">Assistant</span>
                          <span className="message-status">Thinking...</span>
                        </div>
                      </div>
                      <div className="message-text">
                        {streamingMessage}
                        <span className="cursor-blink">|</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="chat-input-area">
            <div className="chat-input-container">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything about your documents..."
                disabled={isLoading}
                className="chat-textarea"
                rows={1}
              />
              
              <div className="chat-input-actions">
                {isLoading ? (
                  <button
                    type="button"
                    onClick={stopGeneration}
                    className="stop-btn"
                    title="Stop generation"
                  >
                    ⏹️
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={!message.trim()}
                    className="send-btn"
                    title="Send message (Enter)"
                  >
                    ➤
                  </button>
                )}
              </div>
            </div>
            
            {currentSession && currentSession.messages.length > 0 && (
              <div className="suggested-questions">
                <span className="suggestions-label">💡 Suggestions:</span>
                {['Can you elaborate on that?', 'What are the key takeaways?', 'Show me related documents'].map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setMessage(suggestion)}
                    className="suggestion-btn"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedChat;
