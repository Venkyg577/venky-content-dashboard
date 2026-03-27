import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Topic = {
  id: string;
  title: string;
  summary: string | null;
  source: string | null;
  url: string | null;
  stage: string;
  status: string;
  connection: string | null;
  fit_score: string | null;
  signal_type: string | null;
  category: string | null;
  channel: string;
  published_date: string | null;
  angle: string | null;
  discovered_at: number;
  created_at: number;
  revised: boolean;
  revised_at: number | null;
};

export type Draft = {
  id: string;
  topic: string;
  content: string | null;
  draft_type: string;
  target_publish_date: string | null;
  word_count: number | null;
  pick_recommended: boolean;
  status: string;
  stage: string;
  channel: string;
  carousel_json: string | null;
  carousel_pdf_url: string | null;
  caption: string | null;
  blog_slug: string | null;
  blog_cluster: string | null;
  blog_keywords: string[] | null;
  blog_url: string | null;
  linkedin_url: string | null;
  created_at: number;
  revised: boolean;
  revised_at: number | null;
};

export type Feedback = {
  id: string;
  item_id: string;
  item_type: string;
  action: string;
  comment: string | null;
  category: string | null;
  created_at: number;
};

export type Run = {
  id: string;
  job_name: string;
  agent_id: string | null;
  status: string;
  started_at: number;
  completed_at: number | null;
  duration_ms: number | null;
};
