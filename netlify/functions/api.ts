import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
};

export const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const path = event.path.replace('/.netlify/functions/api', '');
  const method = event.httpMethod;

  try {
    // GET /topics
    if (path === '/topics' && method === 'GET') {
      const { data, error } = await supabase
        .from('topics')
        .select('*')
        .order('discovered_at', { ascending: false });
      
      if (error) throw error;
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      };
    }

    // GET /drafts
    if (path === '/drafts' && method === 'GET') {
      const { data, error } = await supabase
        .from('drafts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      };
    }

    // GET /feedback
    if (path === '/feedback' && method === 'GET') {
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      };
    }

    // GET /runs
    if (path === '/runs' && method === 'GET') {
      const { data, error } = await supabase
        .from('runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      };
    }

    // GET /agent-tasks
    if (path === '/agent-tasks' && method === 'GET') {
      const { data, error } = await supabase
        .from('agent_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      };
    }

    // POST /approve-topic
    if (path === '/approve-topic' && method === 'POST') {
      const { topicId } = JSON.parse(event.body || '{}');
      
      const { data: topic } = await supabase
        .from('topics')
        .select('*')
        .eq('id', topicId)
        .single();
      
      if (!topic) throw new Error('Topic not found');

      const isCarousel = topic.channel === 'carousel';
      const isBlog = topic.channel === 'blog' || topic.channel === 'both';
      const isLinkedIn = topic.channel === 'linkedin' || topic.channel === 'both';

      // Handle carousel scouted → researching
      if (isCarousel && topic.stage === 'scouted') {
        await supabase.from('topics').update({ status: 'pending', stage: 'researching' }).eq('id', topicId);
        await supabase.from('agent_tasks').insert({
          task_type: 'research',
          agent: 'owl',
          ref_id: topicId,
          ref_title: topic.title,
          payload: { topic_title: topic.title, topic_url: topic.url, topic_source: topic.source },
          status: 'pending'
        });
        
        // Send Slack notification
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
          },
          body: JSON.stringify({
            channel: process.env.SLACK_CHANNEL_AIMY,
            text: `🚀 SPAWN_AGENT: owl\nTask: research\nRef ID: ${topicId}\nTitle: ${topic.title} (carousel)`
          })
        });

        return {
          statusCode: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, message: 'Owl spawning for carousel research' }),
        };
      }

      // Handle LinkedIn/blog logic similarly...
      // (I'll add more handlers as needed)

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true }),
      };
    }

    // POST /approve-draft
    if (path === '/approve-draft' && method === 'POST') {
      const { draftId } = JSON.parse(event.body || '{}');
      
      await supabase.from('drafts')
        .update({ status: 'approved', stage: 'ready_to_post' })
        .eq('id', draftId);

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true }),
      };
    }

    // POST /reject-topic
    if (path === '/reject-topic' && method === 'POST') {
      const { topicId, reason } = JSON.parse(event.body || '{}');
      
      await supabase.from('topics').update({ status: 'rejected' }).eq('id', topicId);
      
      if (reason) {
        await supabase.from('feedback').insert({
          item_id: topicId,
          item_type: 'topic',
          action: 'rejection',
          comment: reason
        });
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true }),
      };
    }

    // POST /archive-topic
    if (path === '/archive-topic' && method === 'POST') {
      const { topicId } = JSON.parse(event.body || '{}');
      await supabase.from('topics').update({ status: 'archived' }).eq('id', topicId);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true }),
      };
    }

    // POST /restore-topic
    if (path === '/restore-topic' && method === 'POST') {
      const { topicId } = JSON.parse(event.body || '{}');
      await supabase.from('topics').update({ status: 'pending', stage: 'scouted' }).eq('id', topicId);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true }),
      };
    }

    // POST /reject-draft
    if (path === '/reject-draft' && method === 'POST') {
      const { draftId, reason } = JSON.parse(event.body || '{}');
      
      await supabase.from('drafts').update({ status: 'rejected' }).eq('id', draftId);
      
      if (reason) {
        await supabase.from('feedback').insert({
          item_id: draftId,
          item_type: 'draft',
          action: 'rejection',
          comment: reason
        });
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true }),
      };
    }

    // POST /archive-draft
    if (path === '/archive-draft' && method === 'POST') {
      const { draftId } = JSON.parse(event.body || '{}');
      await supabase.from('drafts').update({ status: 'archived' }).eq('id', draftId);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true }),
      };
    }

    // POST /restore-draft
    if (path === '/restore-draft' && method === 'POST') {
      const { draftId } = JSON.parse(event.body || '{}');
      await supabase.from('drafts').update({ status: 'pending', stage: 'drafted' }).eq('id', draftId);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true }),
      };
    }

    // POST /revise-draft
    if (path === '/revise-draft' && method === 'POST') {
      const { draftId, feedback: feedbackText } = JSON.parse(event.body || '{}');
      
      await supabase.from('feedback').insert({
        item_id: draftId,
        item_type: 'draft',
        action: 'revision',
        comment: feedbackText
      });

      // Notify via Slack
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
        },
        body: JSON.stringify({
          channel: process.env.SLACK_CHANNEL_AIMY,
          text: `🔄 Revision requested\nDraft ID: ${draftId}\nFeedback: ${feedbackText}`
        })
      });

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true }),
      };
    }

    // POST /publish-draft
    if (path === '/publish-draft' && method === 'POST') {
      const { draftId } = JSON.parse(event.body || '{}');
      await supabase.from('drafts').update({ stage: 'published' }).eq('id', draftId);
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true }),
      };
    }

    return {
      statusCode: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Not found' }),
    };

  } catch (error: any) {
    console.error('API Error:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
