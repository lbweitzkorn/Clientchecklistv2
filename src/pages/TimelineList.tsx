import { useEffect, useState } from 'react';
import { Calendar, MapPin, ExternalLink, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { BRAND } from '../config/brand';
import { calculateCountdown } from '../utils/countdown';
import { trafficLight, trafficLabel } from '../utils/trafficLight';
import type { Timeline } from '../types';

export function TimelineList() {
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [seedLoading, setSeedLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    loadTimelines();
  }, []);

  async function loadTimelines() {
    try {
      const { data, error } = await supabase
        .from('timelines')
        .select(`
          *,
          event:events(*)
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const timelinesWithProgress = await Promise.all(
        (data || []).map(async (timeline) => {
          const { data: tasks } = await supabase
            .from('tasks')
            .select('weight, done')
            .eq('timeline_id', timeline.id);

          const totalWeight = tasks?.reduce((sum, task) => sum + task.weight, 0) || 0;
          const completedWeight =
            tasks?.reduce((sum, task) => sum + (task.done ? task.weight : 0), 0) || 0;
          const progress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;

          return { ...timeline, progress };
        })
      );

      setTimelines(timelinesWithProgress);
    } catch (error) {
      console.error('Error loading timelines:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSeedTemplates() {
    try {
      setSeedLoading(true);
      const response = await fetch('/seed-templates.json');
      const templates = await response.json();

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/templates-seed`;
      const result = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ templates }),
      });

      if (!result.ok) {
        throw new Error('Failed to seed templates');
      }

      const data = await result.json();
      alert(`Successfully seeded ${data.counts.templates} templates with ${data.counts.blocks} blocks and ${data.counts.tasks} tasks!`);
    } catch (error) {
      console.error('Error seeding templates:', error);
      alert('Failed to seed templates. Check console for details.');
    } finally {
      setSeedLoading(false);
    }
  }

  async function handleCreateDemoTimelines() {
    try {
      setCreateLoading(true);
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/timelines-create`;

      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setMonth(today.getMonth() + 6);
      const eventDate = futureDate.toISOString().split('T')[0];

      const demoEvents = [
        {
          code: 'DEMO-WED-001',
          title: 'Sarah & David Wedding',
          type: 'wedding',
          date: eventDate,
          venue: 'Grand Hotel Ballroom',
          name: 'Wedding'
        },
        {
          code: 'DEMO-BAR-001',
          title: 'Joshua Bar Mitzvah',
          type: 'bar_mitzvah',
          date: eventDate,
          venue: 'Temple Beth Shalom',
          name: 'Bar Mitzvah'
        },
        {
          code: 'DEMO-BAT-001',
          title: 'Rachel Bat Mitzvah',
          type: 'bat_mitzvah',
          date: eventDate,
          venue: 'Temple Israel',
          name: 'Bat Mitzvah'
        },
        {
          code: 'DEMO-PARTY-001',
          title: 'Corporate Gala 2025',
          type: 'party',
          date: eventDate,
          venue: 'Downtown Convention Center',
          name: 'Party'
        },
      ];

      let successCount = 0;
      let errorMessages: string[] = [];

      for (const eventData of demoEvents) {
        try {
          const result = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              event: {
                code: eventData.code,
                title: eventData.title,
                type: eventData.type,
                date: eventData.date,
                venue: eventData.venue,
              },
            }),
          });

          if (result.ok) {
            successCount++;
          } else {
            const error = await result.json();
            errorMessages.push(`${eventData.name}: ${error.error || 'Failed'}`);
          }
        } catch (err) {
          errorMessages.push(`${eventData.name}: ${err instanceof Error ? err.message : 'Failed'}`);
        }
      }

      if (successCount > 0) {
        alert(`Successfully created ${successCount} demo timeline(s)!${errorMessages.length > 0 ? '\n\nErrors:\n' + errorMessages.join('\n') : ''}`);
        await loadTimelines();
      } else {
        alert('Failed to create demo timelines. Make sure templates are seeded first.\n\n' + errorMessages.join('\n'));
      }
    } catch (error) {
      console.error('Error creating demo timelines:', error);
      alert('Failed to create demo timelines. Check console for details.');
    } finally {
      setCreateLoading(false);
    }
  }

  function getEventTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      wedding: 'Wedding',
      bar_mitzvah: 'Bar Mitzvah',
      bat_mitzvah: 'Bat Mitzvah',
      party: 'Party',
    };
    return labels[type] || type;
  }

  function formatDate(dateString?: string): string {
    if (!dateString) return 'No date set';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading timelines...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="app-header bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-14">
            <a href="/timelines" className="brand inline-flex items-center">
              <img
                src={BRAND.logoDark}
                alt={BRAND.name}
                width={160}
                height={40}
                className="brand-logo"
              />
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Event Timelines</h1>
            <p className="text-gray-600 mt-1">Manage all your event planning timelines</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSeedTemplates}
              disabled={seedLoading || createLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Upload size={18} />
              {seedLoading ? 'Seeding...' : 'Seed Templates'}
            </button>
            <button
              onClick={handleCreateDemoTimelines}
              disabled={createLoading || seedLoading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Calendar size={18} />
              {createLoading ? 'Creating...' : 'Create Demo Timelines'}
            </button>
          </div>
        </div>

        {timelines.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Timelines Yet</h2>
            <p className="text-gray-500 mb-6">Get started by seeding templates and creating demo timelines</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleSeedTemplates}
                disabled={seedLoading || createLoading}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Upload size={18} />
                {seedLoading ? 'Seeding...' : '1. Seed Templates'}
              </button>
              <button
                onClick={handleCreateDemoTimelines}
                disabled={createLoading || seedLoading}
                className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <Calendar size={18} />
                {createLoading ? 'Creating...' : '2. Create Demo Timelines'}
              </button>
            </div>
            <p className="text-sm text-gray-400 mt-4">Creates 4 demo events: Wedding, Bar Mitzvah, Bat Mitzvah, and Party</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {timelines.map((timeline) => (
              <div
                key={timeline.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm font-medium rounded-full">
                        {timeline.event?.code}
                      </span>
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                        {getEventTypeLabel(timeline.event?.type || '')}
                      </span>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {timeline.event?.title}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      {timeline.event?.date && (
                        <>
                          <div className="flex items-center gap-1">
                            <Calendar size={16} />
                            {formatDate(timeline.event.date)}
                          </div>
                          {(() => {
                            const countdown = calculateCountdown(timeline.event.date);
                            if (!countdown) return null;
                            return (
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-md font-medium ${
                                countdown.isToday
                                  ? 'bg-green-100 text-green-700'
                                  : countdown.isPast
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                {countdown.formatted}
                              </div>
                            );
                          })()}
                        </>
                      )}
                      {timeline.event?.venue && (
                        <div className="flex items-center gap-1">
                          <MapPin size={16} />
                          {timeline.event.venue}
                        </div>
                      )}
                    </div>
                    <div className="mt-3 text-sm text-gray-500">
                      Updated {new Date(timeline.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      {(() => {
                        const status = trafficLight(timeline.progress || 0);
                        const colorClass =
                          status === 'red' ? 'tl-red' :
                          status === 'amber' ? 'tl-amber' :
                          status === 'green' ? 'tl-green' : 'tl-done';
                        return (
                          <>
                            <div className={`text-3xl font-bold ${colorClass}`}>
                              {timeline.progress}%
                            </div>
                            <div className={`text-xs font-semibold mt-1 ${colorClass}`}>
                              {trafficLabel(status)}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <a
                      href={`/timeline/${timeline.id}`}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      Open
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
