import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// Create Supabase client
export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Test Supabase connection
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from(config.supabase.tableName)
      .select('id')
      .limit(1);

    if (error) {
      console.error('❌ Supabase connection test failed:', error.message);
      return false;
    }

    console.log('✅ Supabase connection successful');
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Supabase connection test failed:', errorMessage);
    return false;
  }
}

// Create the documents table if it doesn't exist
export async function createDocumentsTable(): Promise<void> {
  try {
    const { error } = await supabase.rpc('create_documents_table_if_not_exists');
    
    if (error) {
      console.error('❌ Failed to create documents table:', error.message);
      throw error;
    }
    
    console.log('✅ Documents table ready');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error creating documents table:', errorMessage);
    throw new Error(errorMessage);
  }
}
