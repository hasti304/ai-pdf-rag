import express from 'express';
import { documentSummarizer } from '../services/documentSummarizer';
import { initializeAnalytics, trackEvent } from '../middleware/analytics.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../shared/config.js';

const router = express.Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

// Apply analytics middleware
router.use(initializeAnalytics);

// Summarize a document
router.post('/summarize', async (req, res) => {
  try {
    const { 
      documentId, 
      content, 
      filename, 
      summaryType = 'hybrid', 
      targetLength = 'moderate',
      focusAreas = []
    } = req.body;

    if (!documentId || !content || !filename) {
      return res.status(400).json({
        success: false,
        error: 'documentId, content, and filename are required'
      });
    }

    if (content.length < 500) {
      return res.status(400).json({
        success: false,
        error: 'Document too short for summarization (minimum 500 characters)'
      });
    }

    console.log(`📄 Summarization request for ${filename} (${content.length} chars)`);

    const summary = await documentSummarizer.summarizeDocument({
      documentId,
      filename,
      content,
      summaryType,
      targetLength,
      focusAreas
    });

    await trackEvent({
      event_type: 'api_call',
      user_id: req.analytics?.userId,
      session_id: req.analytics?.sessionId,
      metadata: {
        endpoint: '/summarization/summarize',
        document_id: documentId,
        filename,
        original_length: content.length,
        summary_length: summary.summary.length,
        compression_ratio: summary.compressionRatio,
        confidence: summary.confidence,
        summary_type: summaryType,
        target_length: targetLength
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        summary: summary.summary,
        keyPoints: summary.keyPoints,
        topics: summary.topics,
        confidence: summary.confidence,
        compressionRatio: summary.compressionRatio,
        readingTime: summary.readingTime,
        metadata: {
          originalLength: summary.originalLength,
          summaryLength: summary.summaryLength,
          summaryType: summary.summaryType,
          created_at: summary.created_at
        }
      }
    });
  } catch (error) {
    console.error('Summarization error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Summarization failed'
    });
  }
});

// Get summary for a document
router.get('/summary/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    
    const summary = await documentSummarizer.getSummaryByDocument(documentId);
    
    if (!summary) {
      return res.status(404).json({
        success: false,
        error: 'Summary not found for this document'
      });
    }

    await trackEvent({
      event_type: 'api_call',
      user_id: req.analytics?.userId,
      session_id: req.analytics?.sessionId,
      metadata: {
        endpoint: '/summarization/summary/:documentId',
        document_id: documentId,
        summary_found: true
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve summary'
    });
  }
});

// Search summaries
router.post('/search', async (req, res) => {
  try {
    const { query, limit = 10 } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    const results = await documentSummarizer.searchSummaries(query, limit);

    await trackEvent({
      event_type: 'api_call',
      user_id: req.analytics?.userId,
      session_id: req.analytics?.sessionId,
      metadata: {
        endpoint: '/summarization/search',
        query: query.substring(0, 100),
        results_found: results.summaries.length,
        limit
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        query,
        results: results.summaries.map((summary, index) => ({
          summary,
          relevanceScore: results.relevanceScores[index]
        })),
        totalFound: results.summaries.length
      }
    });
  } catch (error) {
    console.error('Summary search error:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed'
    });
  }
});

// Get all summaries with filtering
router.get('/summaries', async (req, res) => {
  try {
    const { 
      minQuality, 
      maxCompressionRatio, 
      topics, 
      limit = 20 
    } = req.query;

    const filter: any = { limit: parseInt(limit as string) };
    
    if (minQuality) filter.minQuality = parseFloat(minQuality as string);
    if (maxCompressionRatio) filter.maxCompressionRatio = parseFloat(maxCompressionRatio as string);
    if (topics) filter.topics = (topics as string).split(',');

    const summaries = documentSummarizer.getSummaries(filter);

    await trackEvent({
      event_type: 'api_call',
      user_id: req.analytics?.userId,
      session_id: req.analytics?.sessionId,
      metadata: {
        endpoint: '/summarization/summaries',
        summaries_returned: summaries.length,
        filter_applied: Object.keys(filter).length > 1
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        summaries,
        count: summaries.length,
        filter
      }
    });
  } catch (error) {
    console.error('Get summaries error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve summaries'
    });
  }
});

// Batch summarize multiple documents
router.post('/batch', async (req, res) => {
  try {
    const { documents } = req.body;

    if (!Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Documents array is required'
      });
    }

    if (documents.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 documents per batch'
      });
    }

    console.log(`📄 Batch summarization request for ${documents.length} documents`);

    const summaries = await documentSummarizer.batchSummarize(documents);

    await trackEvent({
      event_type: 'api_call',
      user_id: req.analytics?.userId,
      session_id: req.analytics?.sessionId,
      metadata: {
        endpoint: '/summarization/batch',
        documents_requested: documents.length,
        summaries_created: summaries.length,
        success_rate: summaries.length / documents.length
      },
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        summaries,
        totalProcessed: documents.length,
        successCount: summaries.length,
        successRate: summaries.length / documents.length
      }
    });
  } catch (error) {
    console.error('Batch summarization error:', error);
    res.status(500).json({
      success: false,
      error: 'Batch summarization failed'
    });
  }
});

// Get summarization metrics
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await documentSummarizer.getMetrics();

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Get summarization metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics'
    });
  }
});

export default router;
