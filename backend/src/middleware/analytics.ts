import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../shared/config.js';

// Extend Request interface to include analytics properties
declare global {
  namespace Express {
    interface Request {
      startTime?: number;
      sessionId?: string;
      analytics?: {
        userId: string;
        sessionId: string;
        ipAddress: string;
        userAgent: string;
      };
    }
  }
}

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

export interface AnalyticsEvent {
  event_type: 'document_upload' | 'question_asked' | 'document_accessed' | 'api_call' | 'error_occurred';
  user_id?: string;
  session_id?: string;
  metadata: Record<string, any>;
  timestamp: string;
  ip_address?: string;
  user_agent?: string;
}

// Generate session ID from request
function generateSessionId(req: Request): string {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const timestamp = Date.now();
  return Buffer.from(`${ip}-${userAgent}-${timestamp}`).toString('base64').slice(0, 32);
}

// Main analytics tracking function
export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  try {
    const eventData = {
      event_type: event.event_type,
      user_id: event.user_id || 'anonymous',
      session_id: event.session_id,
      metadata: event.metadata,
      timestamp: event.timestamp,
      ip_address: event.ip_address,
      user_agent: event.user_agent,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('analytics_events')
      .insert([eventData]);

    if (error) {
      console.error('Analytics tracking error:', error);
    }
  } catch (error) {
    console.error('Analytics tracking exception:', error);
  }
}

// Middleware to initialize analytics for each request
export function initializeAnalytics(req: Request, res: Response, next: NextFunction): void {
  req.startTime = Date.now();
  req.sessionId = generateSessionId(req);
  
  req.analytics = {
    userId: req.headers['x-user-id'] as string || 'anonymous',
    sessionId: req.sessionId,
    ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
    userAgent: req.get('User-Agent') || 'unknown'
  };

  next();
}

// Middleware factory for specific event types
export function analyticsMiddleware(eventType: AnalyticsEvent['event_type']) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Track the event after response is sent
    res.on('finish', async () => {
      const responseTime = Date.now() - (req.startTime || Date.now());
      
      await trackEvent({
        event_type: eventType,
        user_id: req.analytics?.userId,
        session_id: req.analytics?.sessionId,
        ip_address: req.analytics?.ipAddress,
        user_agent: req.analytics?.userAgent,
        metadata: {
          path: req.path,
          method: req.method,
          status_code: res.statusCode,
          response_time: responseTime,
          query_params: req.query,
          body_size: JSON.stringify(req.body).length,
          response_size: res.get('content-length') || 0,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });
    });
    
    next();
  };
}

// Error tracking
export async function trackError(
  error: Error,
  context: Record<string, any> = {},
  req?: Request
): Promise<void> {
  await trackEvent({
    event_type: 'error_occurred',
    user_id: req?.analytics?.userId,
    session_id: req?.analytics?.sessionId,
    ip_address: req?.analytics?.ipAddress,
    user_agent: req?.analytics?.userAgent,
    metadata: {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    },
    timestamp: new Date().toISOString()
  });
}
