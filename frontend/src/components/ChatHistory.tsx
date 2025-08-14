import React from 'react';
import { ChatSession } from '../types/chatTypes';

interface ChatHistoryProps {
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  onSessionSelect: (session: ChatSession) => void;
  onSessionDelete: (sessionId: string) => void;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({
  sessions,
  currentSession,
  onSessionSelect,
  onSessionDelete
}) => {
  return (
    <div className="chat-history">
      <h3 className="text-lg font-semibold mb-4">📚 Chat History</h3>
      
      {sessions.length === 0 ? (
        <div className="text-gray-500 text-sm">
          No chat sessions yet. Start a conversation to see your history here.
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                currentSession?.id === session.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => onSessionSelect(session)}
            >
              <div className="font-medium text-sm truncate">{session.title}</div>
              <div className="text-xs text-gray-500 mt-1">
                {session.metadata.messageCount} messages • {new Date(session.updated_at).toLocaleDateString()}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSessionDelete(session.id);
                }}
                className="text-red-500 text-xs hover:text-red-700 mt-2"
              >
                🗑️ Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatHistory;
