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

      // Helper: send Slack notification
      const notifySlack = async (agent: string, taskType: string, refId: string, title: string) => {
        if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_AIMY) {
          await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` },
            body: JSON.stringify({
              channel: process.env.SLACK_CHANNEL_AIMY,
              text: `:rocket: SPAWN_AGENT: ${agent}\nTask: ${taskType}\nRef ID: ${refId}\nTitle: ${title}`
            })
          });
        }
      };

      // === SCOUTED → RESEARCHED (card moves to Research column) ===
      if (topic.stage === 'scouted') {
        const agent = (isBlog || isCarousel) ? (isCarousel ? 'owl' : 'stork') : 'owl';
        const taskType = isBlog ? 'blog_research' : 'research';

        // Move topic to Research column immediately (agent_tasks shows "working" status)
        await supabase.from('topics').update({ stage: 'researched', status: 'pending' }).eq('id', topicId);

        // Create agent task
        await supabase.from('agent_tasks').insert({
          task_type: taskType,
          agent,
          ref_id: topicId,
          ref_title: topic.title,
          payload: { topic_title: topic.title, topic_url: topic.url, topic_source: topic.source },
          status: 'pending',
        });

        await notifySlack(agent, taskType, topicId, topic.title);

        return {
          statusCode: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, message: `${agent} researching: ${topic.title}` }),
        };
      }

      // === RESEARCHED → DRAFTED (card moves to Drafted column) ===
      if (topic.stage === 'researched') {
        const agent = isBlog ? 'crane' : 'bee';
        const taskType = isBlog ? 'blog_draft' : 'draft';

        // Create draft row in Drafted column
        const draftId = crypto.randomUUID();
        await supabase.from('drafts').insert({
          id: draftId,
          topic: topic.title,
          draft_type: isBlog ? 'blog' : 'commentary',
          channel: topic.channel,
          status: 'pending',
          stage: 'drafted',
          blog_slug: isBlog ? topic.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60) : null,
          created_at: Date.now(),
        });

        // Create agent task pointing to the draft
        await supabase.from('agent_tasks').insert({
          task_type: taskType,
          agent,
          ref_id: draftId,
          ref_title: topic.title,
          payload: { topic_id: topicId, topic_title: topic.title, topic_summary: topic.summary },
          status: 'pending',
        });

        // Mark topic as approved (done in pipeline)
        await supabase.from('topics').update({ status: 'approved' }).eq('id', topicId);

        await notifySlack(agent, taskType, draftId, topic.title);

        return {
          statusCode: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, message: `${agent} drafting: ${topic.title}` }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, message: 'No action for this stage' }),
      };
    }

    // POST /retry-task — reset a failed task to pending so agent-runner picks it up
    if (path === '/retry-task' && method === 'POST') {
      const { taskId } = JSON.parse(event.body || '{}');
      if (!taskId) throw new Error('taskId required');

      const { data: task } = await supabase
        .from('agent_tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (!task) throw new Error('Task not found');
      if (task.status !== 'failed') throw new Error('Only failed tasks can be retried');

      // Reset to pending with cleared error
      await supabase.from('agent_tasks').update({
        status: 'pending',
        error: null,
        claimed_at: null,
        completed_at: null,
        payload: { ...task.payload, retry_count: 0, retry_after: null },
      }).eq('id', taskId);

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, message: `Retrying ${task.agent} for: ${task.ref_title}` }),
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
