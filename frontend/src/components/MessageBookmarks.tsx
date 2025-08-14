import React, { useState } from 'react';
import { ChatBookmark, ChatSession } from '../types/chatTypes';

interface MessageBookmarksProps {
  bookmarks: ChatBookmark[];
  sessions: ChatSession[];
  onBookmarkSelect: (bookmark: ChatBookmark) => void;
  onBookmarkDelete: (bookmarkId: string) => void;
}

const MessageBookmarks: React.FC<MessageBookmarksProps> = ({
  bookmarks,
  sessions,
  onBookmarkSelect,
  onBookmarkDelete
}) => {
  const [editingBookmark, setEditingBookmark] = useState<string | null>(null);

  const getSessionTitle = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    return session ? session.title : 'Unknown Session';
  };

  return (
    <div className="message-bookmarks">
      <h3 className="text-lg font-semibold mb-4">🔖 Bookmarks</h3>
      
      {bookmarks.length === 0 ? (
        <div className="text-gray-500 text-sm">
          No bookmarks yet. Click the bookmark icon on any assistant message to save it here.
        </div>
      ) : (
        <div className="space-y-3">
          {bookmarks.map((bookmark) => (
            <div
              key={bookmark.id}
              className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-start justify-between mb-2">
                <h4 
                  className="font-medium text-sm cursor-pointer hover:text-blue-600"
                  onClick={() => onBookmarkSelect(bookmark)}
                >
                  {bookmark.title}
                </h4>
                <div className="flex space-x-1">
                  <button
                    type="button"
                    onClick={() => setEditingBookmark(
                      editingBookmark === bookmark.id ? null : bookmark.id
                    )}
                    className="text-gray-400 hover:text-gray-600 text-xs"
                    title="Edit bookmark"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => onBookmarkDelete(bookmark.id)}
                    className="text-red-400 hover:text-red-600 text-xs"
                    title="Delete bookmark"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              
              <div className="text-xs text-gray-500 mb-2">
                From: {getSessionTitle(bookmark.sessionId)} • {new Date(bookmark.created_at).toLocaleDateString()}
              </div>
              
              {bookmark.note && (
                <div className="text-sm text-gray-600 mb-2">
                  📝 {bookmark.note}
                </div>
              )}
              
              {bookmark.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {bookmark.tags.map(tag => (
                    <span 
                      key={tag}
                      className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              
              {editingBookmark === bookmark.id && (
                <div className="mt-2 p-2 bg-gray-50 rounded">
                  <textarea
                    placeholder="Add a note to this bookmark..."
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    rows={2}
                    defaultValue={bookmark.note}
                  />
                  <div className="flex justify-end space-x-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setEditingBookmark(null)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingBookmark(null)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MessageBookmarks;
