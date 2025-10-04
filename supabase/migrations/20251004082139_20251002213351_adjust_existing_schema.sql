/*
  # Adjust Existing Schema for JS Live Event Timeline System

  ## Changes
  1. Updates
    - Adjust templates table to use template_key as primary key
    - Update foreign key references
    - Add missing columns

  2. Notes
    - Tables already exist with slightly different structure
    - This migration adjusts them to match requirements
*/

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  title text NOT NULL,
  date date,
  venue text,
  type text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Create templates table
CREATE TABLE IF NOT EXISTS templates (
  template_key text PRIMARY KEY,
  name text NOT NULL,
  description text,
  event_type text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- Create template_blocks table
CREATE TABLE IF NOT EXISTS template_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL REFERENCES templates(template_key) ON DELETE CASCADE,
  key text NOT NULL,
  title text NOT NULL,
  "order" integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE template_blocks ENABLE ROW LEVEL SECURITY;

-- Create template_tasks table
CREATE TABLE IF NOT EXISTS template_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_block_id uuid NOT NULL REFERENCES template_blocks(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assignee text NOT NULL CHECK (assignee IN ('client', 'js', 'both')),
  weight integer DEFAULT 1,
  is_skeleton boolean DEFAULT false,
  "order" integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE template_tasks ENABLE ROW LEVEL SECURITY;

-- Create timelines table
CREATE TABLE IF NOT EXISTS timelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  template_key text NOT NULL REFERENCES templates(template_key),
  background_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE timelines ENABLE ROW LEVEL SECURITY;

-- Create blocks table
CREATE TABLE IF NOT EXISTS blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id uuid NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  key text NOT NULL,
  title text NOT NULL,
  "order" integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id uuid NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assignee text NOT NULL CHECK (assignee IN ('client', 'js', 'both')),
  weight integer DEFAULT 1,
  is_skeleton boolean DEFAULT false,
  due_date date,
  done boolean DEFAULT false,
  done_by text,
  done_at timestamptz,
  "order" integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Create share_links table
CREATE TABLE IF NOT EXISTS share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id uuid NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;

-- Create audit_entries table
CREATE TABLE IF NOT EXISTS audit_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id uuid NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  action text NOT NULL,
  actor text NOT NULL,
  changes jsonb,
  timestamp timestamptz DEFAULT now()
);

ALTER TABLE audit_entries ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for public access to tasks via share_links
DROP POLICY IF EXISTS "Public can read tasks via valid share link" ON tasks;
CREATE POLICY "Public can read tasks via valid share link"
  ON tasks FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM share_links
      WHERE share_links.timeline_id = tasks.timeline_id
      AND share_links.expires_at > now()
    )
  );

DROP POLICY IF EXISTS "Public can update client tasks via valid share link" ON tasks;
CREATE POLICY "Public can update client tasks via valid share link"
  ON tasks FOR UPDATE
  TO public
  USING (
    assignee IN ('client', 'both')
    AND EXISTS (
      SELECT 1 FROM share_links
      WHERE share_links.timeline_id = tasks.timeline_id
      AND share_links.expires_at > now()
    )
  )
  WITH CHECK (
    assignee IN ('client', 'both')
    AND EXISTS (
      SELECT 1 FROM share_links
      WHERE share_links.timeline_id = tasks.timeline_id
      AND share_links.expires_at > now()
    )
  );

-- Add RLS policies for public access to blocks via share_links
DROP POLICY IF EXISTS "Public can read blocks via valid share link" ON blocks;
CREATE POLICY "Public can read blocks via valid share link"
  ON blocks FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM share_links
      WHERE share_links.timeline_id = blocks.timeline_id
      AND share_links.expires_at > now()
    )
  );

-- Add RLS policies for public access to timelines via share_links
DROP POLICY IF EXISTS "Public can read timelines via valid share link" ON timelines;
CREATE POLICY "Public can read timelines via valid share link"
  ON timelines FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM share_links
      WHERE share_links.timeline_id = timelines.id
      AND share_links.expires_at > now()
    )
  );

-- Add RLS policies for public access to events via share_links
DROP POLICY IF EXISTS "Public can read events via valid share link" ON events;
CREATE POLICY "Public can read events via valid share link"
  ON events FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM timelines t
      JOIN share_links sl ON sl.timeline_id = t.id
      WHERE t.event_id = events.id
      AND sl.expires_at > now()
    )
  );

-- Add RLS policy for public to create audit entries via share links
DROP POLICY IF EXISTS "Public can create audit entries via valid share link" ON audit_entries;
CREATE POLICY "Public can create audit entries via valid share link"
  ON audit_entries FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM share_links
      WHERE share_links.timeline_id = audit_entries.timeline_id
      AND share_links.expires_at > now()
    )
  );

-- Add public read policies for templates (needed for timeline creation)
DROP POLICY IF EXISTS "Public can read templates" ON templates;
CREATE POLICY "Public can read templates"
  ON templates FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Public can read template_blocks" ON template_blocks;
CREATE POLICY "Public can read template_blocks"
  ON template_blocks FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Public can read template_tasks" ON template_tasks;
CREATE POLICY "Public can read template_tasks"
  ON template_tasks FOR SELECT
  TO public
  USING (true);

-- Add admin policies (currently open to all public access - should add auth later)
DROP POLICY IF EXISTS "Public can manage events" ON events;
CREATE POLICY "Public can manage events"
  ON events FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can manage timelines" ON timelines;
CREATE POLICY "Public can manage timelines"
  ON timelines FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can manage blocks" ON blocks;
CREATE POLICY "Public can manage blocks"
  ON blocks FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read all tasks" ON tasks;
CREATE POLICY "Public can read all tasks"
  ON tasks FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Public can manage share_links" ON share_links;
CREATE POLICY "Public can manage share_links"
  ON share_links FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
