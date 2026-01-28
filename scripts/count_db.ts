/* eslint-disable no-console */
import { supabase } from '../src/modules/supabase';

async function countMemorials() {
  if (!supabase) {
    console.error('Supabase not configured');
    return;
  }
  
  const { count, error } = await supabase
    .from('memorials')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error fetching count:', error);
  } else {
    console.log(`Total memorials in database: ${count}`);
  }
}

countMemorials();
