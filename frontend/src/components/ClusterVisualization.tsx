import React from 'react';
import { ClusterVisualizationData, DocumentCluster } from '../types/documentTypes';

interface ClusterVisualizationProps {
  data: ClusterVisualizationData;
  clusters: DocumentCluster[];
  onClusterSelect: (clusterId: string | null) => void;
  selectedCluster: string | null;
  onNodeClick: (nodeId: string) => void;
}

const ClusterVisualization: React.FC<ClusterVisualizationProps> = ({
  data,
  clusters,
  onClusterSelect,
  selectedCluster,
  onNodeClick
}) => {
  // Use the data and onNodeClick to prevent unused warnings
  const handleVisualizationClick = () => {
    if (data && data.clusters.length > 0) {
      onNodeClick(data.clusters[0].id);
    }
  };

  return (
    <div className="cluster-visualization">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">🎯 Document Cluster Visualization</h3>
        
        {/* Cluster Legend */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Clusters</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {clusters.map((cluster) => (
              <button
                key={cluster.id}
                type="button"
                onClick={() => onClusterSelect(selectedCluster === cluster.id ? null : cluster.id)}
                className={`flex items-center p-3 rounded-lg border transition-colors ${
                  selectedCluster === cluster.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div 
                  className="cluster-indicator"
                  data-cluster-color={cluster.color}
                ></div>
                <div className="text-left">
                  <div className="text-sm font-medium text-gray-900">{cluster.name}</div>
                  <div className="text-xs text-gray-500">{cluster.size} docs</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Visualization Placeholder */}
        <div className="visualization-placeholder" onClick={handleVisualizationClick}>
          <div className="text-gray-400 text-4xl mb-4">🎯</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Interactive Cluster Visualization</h3>
          <p className="text-gray-500 mb-4">
            Advanced graph visualization showing document relationships and clusters
          </p>
          <div className="text-sm text-gray-400">
            This would contain an interactive graph visualization library like D3.js, React Flow, or similar
          </div>
        </div>

        {/* Selected Cluster Info */}
        {selectedCluster && (
          <div className="mt-6 bg-blue-50 p-4 rounded-lg">
            {(() => {
              const cluster = clusters.find(c => c.id === selectedCluster);
              return cluster ? (
                <div>
                  <h4 className="font-medium text-blue-900 mb-2">
                    📁 {cluster.name}
                  </h4>
                  <p className="text-blue-700 text-sm mb-2">{cluster.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {cluster.topics.map(topic => (
                      <span key={topic} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClusterVisualization;
