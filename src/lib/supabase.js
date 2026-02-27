import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://hzzmbnpjdgoicnacpabc.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6em1ibnBqZGdvaWNuYWNwYWJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxODY3NTAsImV4cCI6MjA4Nzc2Mjc1MH0.8zM3xv7xI9oNANd_8wVSVS_lNeY1Mxn1BuYqmiKQ6x4';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
