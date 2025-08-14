import React, { useState } from 'react';
import { Document, DocumentCluster, DocumentFilter } from '../types/documentTypes';

interface DocumentListProps {
  documents: Document[];
  clusters: DocumentCluster[];
  filter: DocumentFilter;
  onFilterChange: (filter: DocumentFilter) => void;
  onClusterSelect: (clusterId: string | null) => void;
  selectedCluster: string | null;
  apiEndpoint: string;
}

const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  clusters,
  filter,
  onFilterChange,
  onClusterSelect,
  selectedCluster,
  apiEndpoint
}) => {
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [showSummary, setShowSummary] = useState<string | null>(null);

  // Sort documents
  const sortedDocuments = [...documents].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'name':
        comparison = a.filename.localeCompare(b.filename);
        break;
      case 'date':
        comparison = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
    }
    
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  // Handle document selection
  const toggleDocumentSelection = (docId: string) => {
    const newSelection = new Set(selectedDocuments);
    if (newSelection.has(docId)) {
      newSelection.delete(docId);
    } else {
      newSelection.add(docId);
    }
    setSelectedDocuments(newSelection);
  };

  // Get cluster info
  const getClusterInfo = (clusterId: string) => {
    return clusters.find(cluster => cluster.id === clusterId);
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Handle document actions
  const handleDocumentAction = async (action: string, documentIds: string[]) => {
    try {
      switch (action) {
        case 'delete':
          await Promise.all(documentIds.map(id =>
            fetch(`${apiEndpoint}/documents/${id}`, { method: 'DELETE' })
          ));
          break;
        case 'reprocess':
          await Promise.all(documentIds.map(id =>
            fetch(`${apiEndpoint}/documents/${id}/reprocess`, { method: 'POST' })
          ));
          break;
      }
      setSelectedDocuments(new Set());
    } catch (error) {
      console.error(`Action ${action} failed:`, error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters and Search */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div>
            <label htmlFor="search-input" className="block text-sm font-medium text-gray-700 mb-2">
              Search Documents
            </label>
            <input
              id="search-input"
              type="text"
              placeholder="Search by filename..."
              value={filter.search || ''}
              onChange={(e) => onFilterChange({ ...filter, search: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Cluster Filter */}
          <div>
            <label htmlFor="cluster-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Cluster
            </label>
            <select
              id="cluster-filter"
              title="Select cluster to filter documents"
              aria-label="Filter documents by cluster"
              value={selectedCluster || ''}
              onChange={(e) => onClusterSelect(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Clusters</option>
              {clusters.map(cluster => (
                <option key={cluster.id} value={cluster.id}>
                  {cluster.name} ({cluster.size} docs)
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Status Filter
            </label>
            <select
              id="status-filter"
              title="Select status to filter documents"
              aria-label="Filter documents by status"
              value={filter.status?.[0] || ''}
              onChange={(e) => onFilterChange({ 
                ...filter, 
                status: e.target.value ? [e.target.value as 'processing' | 'ready' | 'error'] : undefined 
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="ready">Ready</option>
              <option value="processing">Processing</option>
              <option value="error">Error</option>
            </select>
          </div>

          {/* Sort */}
          <div>
            <label htmlFor="sort-select" className="block text-sm font-medium text-gray-700 mb-2">
              Sort Documents
            </label>
            <div className="flex space-x-2">
              <select
                id="sort-select"
                title="Select field to sort documents by"
                aria-label="Sort documents by field"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'size')}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="date">Upload Date</option>
                <option value="name">File Name</option>
                <option value="size">File Size</option>
              </select>
              <button
                type="button"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
                aria-label={`Change sort order to ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedDocuments.size > 0 && (
        <div className="bg-blue-50 p-4 rounded-lg flex items-center justify-between">
          <span className="text-blue-800">
            {selectedDocuments.size} document(s) selected
          </span>
          <div className="space-x-2">
            <button
              type="button"
              onClick={() => handleDocumentAction('reprocess', Array.from(selectedDocuments))}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              🔄 Reprocess
            </button>
            <button
              type="button"
              onClick={() => handleDocumentAction('delete', Array.from(selectedDocuments))}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      )}

      {/* Document List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <input
                  type="checkbox"
                  checked={selectedDocuments.size === documents.length && documents.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedDocuments(new Set(documents.map(doc => doc.id)));
                    } else {
                      setSelectedDocuments(new Set());
                    }
                  }}
                  aria-label="Select all documents"
                  title="Select or deselect all documents"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Document
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cluster
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Size
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Uploaded
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedDocuments.map((document) => {
              const clusterInfo = document.clusterId ? getClusterInfo(document.clusterId) : null;
              
              return (
                <tr key={document.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedDocuments.has(document.id)}
                      onChange={() => toggleDocumentSelection(document.id)}
                      aria-label={`Select document ${document.filename}`}
                      title={`Select document ${document.filename}`}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <span className="text-blue-600 font-medium">📄</span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                          {document.filename}
                        </div>
                        <div className="text-sm text-gray-500">
                          {document.chunkCount} chunks
                          {document.tags.length > 0 && (
                            <span className="ml-2">
                              {document.tags.slice(0, 2).map(tag => (
                                <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 mr-1">
                                  {tag}
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {clusterInfo ? (
                      <div className="flex items-center">
                        <div 
                          className="cluster-color-indicator"
                          data-cluster-color={clusterInfo.color}
                        ></div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {clusterInfo.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {clusterInfo.topics.slice(0, 2).join(', ')}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400">Unclustered</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      document.status === 'ready' ? 'bg-green-100 text-green-800' :
                      document.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {document.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatFileSize(document.size)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(document.uploadedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    {document.summary && (
                      <button
                        type="button"
                        onClick={() => setShowSummary(showSummary === document.id ? null : document.id)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        📋 Summary
                      </button>
                    )}
                    <button type="button" className="text-green-600 hover:text-green-900">
                      👁️ View
                    </button>
                    <button type="button" className="text-red-600 hover:text-red-900">
                      🗑️ Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sortedDocuments.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-2">📁</div>
            <p className="text-gray-500">No documents found matching your filters.</p>
          </div>
        )}
      </div>

      {/* Document Summary Modal */}
      {showSummary && (
        <DocumentSummaryModal
          document={sortedDocuments.find(doc => doc.id === showSummary)!}
          onClose={() => setShowSummary(null)}
        />
      )}
    </div>
  );
};

// Document Summary Modal Component
const DocumentSummaryModal: React.FC<{
  document: Document;
  onClose: () => void;
}> = ({ document, onClose }) => {
  if (!document.summary) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              📋 Summary: {document.filename}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close summary modal"
              title="Close summary modal"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Summary</h4>
              <p className="text-gray-600 text-sm leading-relaxed">
                {document.summary.summary}
              </p>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Key Points</h4>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                {document.summary.keyPoints.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Topics</h4>
              <div className="flex flex-wrap gap-2">
                {document.summary.topics.map(topic => (
                  <span key={topic} className="px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded">
                    {topic}
                  </span>
                ))}
              </div>
            </div>
            
            <div className="text-sm text-gray-500 border-t pt-4">
              <p>Confidence: {(document.summary.confidence * 100).toFixed(1)}%</p>
              <p>Reading Time: {document.summary.readingTime} min</p>
              <p>Compression: {(document.summary.compressionRatio * 100).toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentList;
