import React, { useState, useEffect, useCallback } from 'react';
import { Document, DocumentCluster, DocumentFilter, DocumentStats, ClusterVisualizationData } from '../types/documentTypes';
import ClusterVisualization from './ClusterVisualization';
import DocumentList from './DocumentList';
import DocumentUpload from './DocumentUpload';
import '../styles/document-manager.css';

interface DocumentManagerProps {
  apiEndpoint: string;
}

const DocumentManager: React.FC<DocumentManagerProps> = ({ apiEndpoint }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [clusters, setClusters] = useState<DocumentCluster[]>([]);
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [visualizationData, setVisualizationData] = useState<ClusterVisualizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'list' | 'clusters' | 'upload'>('list');
  const [filter, setFilter] = useState<DocumentFilter>({});
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);

  // Fetch documents and clusters
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch documents
      const documentsResponse = await fetch(`${apiEndpoint}/documents`);
      if (!documentsResponse.ok) throw new Error('Failed to fetch documents');
      const documentsData = await documentsResponse.json();
      
      // Fetch clusters
      const clustersResponse = await fetch(`${apiEndpoint}/clustering/clusters`);
      if (!clustersResponse.ok) throw new Error('Failed to fetch clusters');
      const clustersData = await clustersResponse.json();
      
      // Fetch stats
      const statsResponse = await fetch(`${apiEndpoint}/documents/stats`);
      if (!statsResponse.ok) throw new Error('Failed to fetch stats');
      const statsData = await statsResponse.json();
      
      // Fetch visualization data
      const vizResponse = await fetch(`${apiEndpoint}/clustering/visualization`);
      if (!vizResponse.ok) throw new Error('Failed to fetch visualization data');
      const vizData = await vizResponse.json();
      
      setDocuments(documentsData.data || []);
      setClusters(clustersData.data?.clusters || []);
      setStats(statsData.data);
      setVisualizationData(vizData.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [apiEndpoint]);

  // Trigger clustering
  const triggerClustering = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${apiEndpoint}/clustering/cluster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceReclustering: true })
      });
      
      if (!response.ok) throw new Error('Clustering failed');
      
      // Refresh data after clustering
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clustering failed');
    }
  }, [apiEndpoint, fetchData]);

  // Handle file upload
  const handleFileUpload = useCallback(async (files: FileList) => {
    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch(`${apiEndpoint}/ingest`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Upload failed');

      // Refresh data after upload
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  }, [apiEndpoint, fetchData]);

  // Filter documents
  const filteredDocuments = documents.filter(doc => {
    if (filter.search && !doc.filename.toLowerCase().includes(filter.search.toLowerCase())) {
      return false;
    }
    if (filter.clusters && filter.clusters.length > 0 && !filter.clusters.includes(doc.clusterId || '')) {
      return false;
    }
    if (filter.status && filter.status.length > 0 && !filter.status.includes(doc.status)) {
      return false;
    }
    if (selectedCluster && doc.clusterId !== selectedCluster) {
      return false;
    }
    return true;
  });

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading document management...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️ Error</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">📚 Document Management</h1>
              <p className="text-gray-600 mt-2">Organize and explore your documents with AI clustering</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={triggerClustering}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center"
              >
                🎯 Re-cluster Documents
              </button>
              <button
                onClick={fetchData}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.totalDocuments}</div>
                <div className="text-sm text-blue-700">Total Documents</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.totalClusters}</div>
                <div className="text-sm text-green-700">Clusters</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{stats.avgClusterSize.toFixed(1)}</div>
                <div className="text-sm text-yellow-700">Avg Cluster Size</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{(stats.storageUsed / 1024 / 1024).toFixed(1)}MB</div>
                <div className="text-sm text-purple-700">Storage Used</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-gray-600">{stats.processingQueue}</div>
                <div className="text-sm text-gray-700">Processing Queue</div>
              </div>
            </div>
          )}

          {/* Navigation Tabs */}
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveView('list')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeView === 'list'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              📋 Document List
            </button>
            <button
              onClick={() => setActiveView('clusters')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeView === 'clusters'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              🎯 Cluster Visualization
            </button>
            <button
              onClick={() => setActiveView('upload')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeView === 'upload'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              📤 Upload Documents
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeView === 'list' && (
          <DocumentList
            documents={filteredDocuments}
            clusters={clusters}
            filter={filter}
            onFilterChange={setFilter}
            onClusterSelect={setSelectedCluster}
            selectedCluster={selectedCluster}
            apiEndpoint={apiEndpoint}
          />
        )}

        {activeView === 'clusters' && visualizationData && (
          <ClusterVisualization
            data={visualizationData}
            clusters={clusters}
            onClusterSelect={setSelectedCluster}
            selectedCluster={selectedCluster}
            onNodeClick={(nodeId: string) => {
              console.log('Node clicked:', nodeId);
            }}
          />
        )}

        {activeView === 'upload' && (
          <DocumentUpload
            onUpload={handleFileUpload}
            apiEndpoint={apiEndpoint}
          />
        )}
      </div>
    </div>
  );
};

export default DocumentManager;
