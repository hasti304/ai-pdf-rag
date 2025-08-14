import React, { useState } from 'react';
import { ChatSession, ChatBookmark, SearchResult } from '../types/chatTypes';

interface AdvancedSearchProps {
  sessions: ChatSession[];
  bookmarks: ChatBookmark[];
  onResultSelect: (result: SearchResult) => void;
}

const AdvancedSearch: React.FC<AdvancedSearchProps> = ({
  sessions,
  bookmarks,
  onResultSelect
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    
    // Simple search implementation
    const searchResults: SearchResult[] = [];
    
    // Search through messages
    sessions.forEach(session => {
      session.messages.forEach(message => {
        if (message.content.toLowerCase().includes(query.toLowerCase())) {
          searchResults.push({
            type: 'message',
            id: message.id,
            title: `${message.type === 'user' ? 'You' : 'Assistant'}: ${message.content.slice(0, 50)}...`,
            content: message.content,
            relevanceScore: 0.8,
            timestamp: message.timestamp,
            metadata: { sessionId: session.id, messageType: message.type }
          });
        }
      });
    });
    
    // Search through bookmarks
    bookmarks.forEach(bookmark => {
      if (bookmark.title.toLowerCase().includes(query.toLowerCase()) || 
          bookmark.note.toLowerCase().includes(query.toLowerCase())) {
        searchResults.push({
          type: 'bookmark',
          id: bookmark.id,
          title: `🔖 ${bookmark.title}`,
          content: bookmark.note || bookmark.title,
          relevanceScore: 0.9,
          timestamp: bookmark.created_at,
          metadata: { sessionId: bookmark.sessionId, messageId: bookmark.messageId }
        });
      }
    });
    
    setResults(searchResults.slice(0, 20)); // Limit to 20 results
    setIsSearching(false);
  };

  return (
    <div className="advanced-search">
      <h3 className="text-lg font-semibold mb-4">🔍 Advanced Search</h3>
      
      <div className="search-input-container">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search messages, bookmarks..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={!query.trim() || isSearching}
          className="mt-2 w-full px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="search-results mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Found {results.length} results
          </h4>
          <div className="space-y-2">
            {results.map((result) => (
              <div
                key={result.id}
                className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                onClick={() => onResultSelect(result)}
              >
                <div className="font-medium text-sm">{result.title}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {result.type} • {new Date(result.timestamp).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {query && results.length === 0 && !isSearching && (
        <div className="text-gray-500 text-sm mt-4">
          No results found for {query}
        </div>
      )}
    </div>
  );
};

export default AdvancedSearch;
