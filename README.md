# Venky's DM Team Dashboard

Content pipeline dashboard for tracking Wolf, Eagle, Owl, Bee agents and their outputs.

## Setup

### 1. Set up Supabase

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project (name it `venky-dashboard`)
3. Go to **SQL Editor** and paste the contents of `dashboard-supabase-schema.sql`
4. Run the SQL to create tables
5. Get your credentials:
   - Project URL: Settings → API → Project URL
   - Anon key: Settings → API → anon public key
   - Service role key: Settings → API → service_role (keep secret!)

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Deploy to Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Initialize
netlify init

# Deploy
netlify deploy --prod
```

### 6. Configure Netlify Environment Variables

After deploying, go to your Netlify dashboard:

1. Navigate to **Site Settings → Environment Variables**
2. Add these variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key

### 7. Verify Sync Function

The sync function runs every 5 minutes automatically. To test manually:

```bash
# Trigger sync via Netlify CLI
netlify functions:invoke sync --local
```

Or check the function logs in Netlify dashboard.

## Dashboard Features

- **Agent Status**: See which agents are running, completed, or failed
- **Weekly Metrics**: Topics found, briefs created, drafts generated
- **Upcoming Posts**: Content calendar with publish dates and status
- **Live Updates**: Data refreshes every 30 seconds
- **Sync**: Automatically pulls data from OpenClaw workspaces every 5 minutes

## Data Sources

The sync function reads from:
- `/data/.openclaw/workspace-wolf/memory/scouted-topics.md` → topics table
- `/data/.openclaw/workspace-wolf/content-bank/drafts/*` → drafts table
- `/data/.openclaw/cron/jobs.json` → runs table

## Future Enhancements

- [ ] Draft approval workflow (approve/reject buttons)
- [ ] Research briefs viewer
- [ ] Topics explorer
- [ ] Download reports
- [ ] Calendar view
- [ ] Agent-specific pages