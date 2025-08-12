import express from 'express';
import { documentClustering } from '../services/documentClustering.js';
import { initializeAnalytics, trackEvent } from '../middleware/analytics.js';

const router = express.Router();

// Apply analytics middleware
router.use(initializeAnalytics);

// Perform document clustering
router.post('/cluster', async (req, res) => {
  try {
    const { forceReclustering = false } = req.body;
    
    console.log(`🎯 Starting document clustering (force: ${forceReclustering})...`);
    
    const metrics = await documentClustering.performDocumentClustering(forceReclustering);
    
    await trackEvent({
      event_type: 'api_call',
      user_id: req.analytics?.userId,
      session_id: req.analytics?.sessionId,
      metadata: {
        endpoint: '/clustering/cluster',
        clusters_created: metrics.totalClusters,
        documents_processed: metrics.totalDocuments,
        silhouette_score: metrics.silhouetteScore,
        force_reclustering: forceReclustering
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Document clustering completed successfully',
      data: metrics
    });
  } catch (error) {
    console.error('Clustering API error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Clustering failed'
    });
  }
});

// Get all clusters
router.get('/clusters', async (req, res) => {
  try {
    const clusters = documentClustering.getAllClusters();
    
    await trackEvent({
      event_type: 'api_call',
      user_id: req.analytics?.userId,
      session_id: req.analytics?.sessionId,
      metadata: {
        endpoint: '/clustering/clusters',
        clusters_returned: clusters.length
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        clusters: clusters.map(cluster => ({
          id: cluster.id,
          name: cluster.name,
          description: cluster.description,
          size: cluster.size,
          topics: cluster.topics,
          coherenceScore: cluster.coherenceScore,
          created_at: cluster.created_at
        }))
      }
    });
  } catch (error) {
    console.error('Get clusters error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve clusters'
    });
  }
});

// Get cluster details
router.get('/clusters/:clusterId', async (req, res) => {
  try {
    const { clusterId } = req.params;
    const cluster = documentClustering.getClusterInfo(clusterId);
    
    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster not found'
      });
    }

    await trackEvent({
      event_type: 'api_call',
      user_id: req.analytics?.userId,
      session_id: req.analytics?.sessionId,
      metadata: {
        endpoint: '/clustering/clusters/:id',
        cluster_id: clusterId,
        cluster_size: cluster.size
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: cluster
    });
  } catch (error) {
    console.error('Get cluster details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cluster details'
    });
  }
});

// Find similar documents
router.post('/similar', async (req, res) => {
  try {
    const { documentId, limit = 5, threshold = 0.7 } = req.body;
    
    if (!documentId) {
      return res.status(400).json({
        success: false,
        error: 'documentId is required'
      });
    }

    const similarDocuments = await documentClustering.findSimilarDocuments(
      documentId,
      Math.min(limit, 10), // Cap at 10
      Math.max(threshold, 0.5) // Minimum threshold of 0.5
    );

    await trackEvent({
      event_type: 'api_call',
      user_id: req.analytics?.userId,
      session_id: req.analytics?.sessionId,
      metadata: {
        endpoint: '/clustering/similar',
        document_id: documentId,
        similar_found: similarDocuments.length,
        threshold_used: threshold
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        documentId,
        similarDocuments,
        count: similarDocuments.length
      }
    });
  } catch (error) {
    console.error('Find similar documents error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to find similar documents'
    });
  }
});

// Get document recommendations
router.post('/recommendations', async (req, res) => {
  try {
    const { query, userContext } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'query is required'
      });
    }

    const recommendations = await documentClustering.getDocumentRecommendations(
      query,
      userContext
    );

    await trackEvent({
      event_type: 'api_call',
      user_id: req.analytics?.userId,
      session_id: req.analytics?.sessionId,
      metadata: {
        endpoint: '/clustering/recommendations',
        query: query.substring(0, 100),
        content_recommendations: recommendations.byContent.length,
        topic_recommendations: recommendations.byTopic.length,
        similarity_recommendations: recommendations.bySimilarity.length
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get document recommendations'
    });
  }
});

export default router;
