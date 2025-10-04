import { useEffect, useState } from 'react';
import { Calendar, MapPin, ChevronDown, ChevronUp, Eye, EyeOff, Printer, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ProgressRing } from '../components/ProgressRing';
import { calculateBlockProgress, calculateTimelineProgress, calculateProgressByAssignee } from '../utils/progress';
import { BRAND, detectBackgroundBrightness } from '../config/brand';
import themes, { type ThemeKey } from '../lib/themes';
import type { Timeline, Task } from '../types';

export function ClientView() {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const [showBackground, setShowBackground] = useState(true);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['client', 'js', 'joint']));
  const [logoSrc, setLogoSrc] = useState(BRAND.logoDark);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setError('Invalid or missing token');
      setLoading(false);
      return;
    }

    loadTimelineByToken(token);
  }, []);

  async function loadTimelineByToken(token: string) {
    try {
      const { data: shareLink, error: shareLinkError } = await supabase
        .from('share_links')
        .select('timeline_id, expires_at')
        .eq('token', token)
        .maybeSingle();

      if (shareLinkError) throw shareLinkError;

      if (!shareLink) {
        setError('Invalid or expired link');
        setLoading(false);
        return;
      }

      if (new Date(shareLink.expires_at) < new Date()) {
        setError('This link has expired');
        setLoading(false);
        return;
      }

      const { data, error: timelineError } = await supabase
        .from('timelines')
        .select(`
          *,
          event:events(*),
          blocks(
            *,
            tasks(*)
          )
        `)
        .eq('id', shareLink.timeline_id)
        .single();

      if (timelineError) throw timelineError;

      if (data.blocks) {
        data.blocks.sort((a, b) => a.order - b.order);
        data.blocks.forEach((block) => {
          if (block.tasks) {
            block.tasks.sort((a, b) => a.order - b.order);
          }
        });
      }

      setTimeline(data);
      setExpandedBlocks(new Set(data.blocks?.map((b) => b.id) || []));

      if (data.background_url) {
        detectBackgroundBrightness(data.background_url).then((isBright) => {
          setLogoSrc(isBright ? BRAND.logoDark : BRAND.logoLight);
        });
      }
    } catch (error) {
      console.error('Error loading timeline:', error);
      setError('Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }

  async function handleTaskToggle(task: Task) {
    if (!timeline || task.assignee === 'js') return;

    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          done: !task.done,
          done_at: !task.done ? new Date().toISOString() : null,
          done_by: !task.done ? 'client' : null,
        })
        .eq('id', task.id);

      if (error) throw error;

      await supabase.from('audit_entries').insert({
        timeline_id: timeline.id,
        task_id: task.id,
        action: !task.done ? 'check' : 'uncheck',
        actor: 'client',
        changes: { done: { from: task.done, to: !task.done } },
      });

      if (timeline.blocks) {
        setTimeline({
          ...timeline,
          blocks: timeline.blocks.map((block) => ({
            ...block,
            tasks: block.tasks?.map((t) =>
              t.id === task.id ? { ...t, done: !t.done } : t
            ),
          })),
        });
      }
    } catch (error) {
      console.error('Error updating task:', error);
      alert('Failed to update task. Please try again.');
    }
  }

  function toggleBlock(blockId: string) {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }

  function toggleFilter(assignee: string) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(assignee)) {
        next.delete(assignee);
      } else {
        next.add(assignee);
      }
      return next;
    });
  }

  async function handleAddGeneralTask() {
    if (!timeline || !newTaskTitle.trim()) return;

    const generalBlock = timeline.blocks?.find(b => b.is_general);
    if (!generalBlock) return;

    try {
      const maxOrder = Math.max(0, ...(generalBlock.tasks?.map(t => t.order) || [0]));

      const { error } = await supabase
        .from('tasks')
        .insert({
          timeline_id: timeline.id,
          block_id: generalBlock.id,
          title: newTaskTitle.trim(),
          assignee: 'client',
          weight: 1,
          is_skeleton: false,
          done: false,
          due_date: newTaskDueDate || null,
          order: maxOrder + 1,
        });

      if (error) throw error;

      setNewTaskTitle('');
      setNewTaskDueDate('');
      setShowAddTask(false);

      const token = new URLSearchParams(window.location.search).get('token');
      if (token) {
        await loadTimelineByToken(token);
      }
    } catch (error) {
      console.error('Error adding task:', error);
      alert('Failed to add task');
    }
  }

  function getAssigneeColor(assignee: string): string {
    switch (assignee) {
      case 'client':
        return 'bg-blue-100 text-blue-700';
      case 'js':
        return 'bg-purple-100 text-purple-700';
      case 'joint':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  }

  function isTaskVisible(task: Task): boolean {
    return activeFilters.has(task.assignee);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading your timeline...</div>
      </div>
    );
  }

  if (error || !timeline) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">{error || 'Timeline not found'}</p>
        </div>
      </div>
    );
  }

  const allTasks = timeline.blocks?.flatMap((block) => block.tasks || []) || [];
  const generalTasks = timeline.blocks?.filter(b => b.is_general).flatMap((block) => block.tasks || []) || [];
  const includeGeneral = timeline.include_general_in_totals ?? true;
  const progress = timeline.blocks ? calculateTimelineProgress(timeline.blocks, includeGeneral) : null;
  const progressByAssignee = calculateProgressByAssignee(allTasks);
  const generalProgress = calculateBlockProgress(generalTasks);

  const themeKey = timeline.template_key as ThemeKey;
  const backgroundImage = themes[themeKey] || themes.wedding;

  return (
    <div className="min-h-screen relative">
      {showBackground && (
        <>
          <div className="timeline-bg" style={{ backgroundImage: `url(${backgroundImage})` }} />
          <div className="timeline-overlay" />
        </>
      )}

      <div className="timeline-content">
        <header className="client-header flex flex-col items-center py-6 px-4">
          <img
            src={logoSrc}
            alt={BRAND.name}
            height={32}
            className="w-auto mb-3"
            style={{ imageRendering: '-webkit-optimize-contrast' }}
          />
        </header>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-end gap-3 mb-4 print:hidden">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur text-gray-700 rounded-lg hover:bg-white transition-colors shadow-sm border border-gray-200"
            >
              <Printer size={18} />
              Print Timeline
            </button>
            <button
              onClick={() => setShowBackground(!showBackground)}
              className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur text-gray-700 rounded-lg hover:bg-white transition-colors shadow-sm border border-gray-200"
            >
              {showBackground ? <EyeOff size={18} /> : <Eye size={18} />}
              {showBackground ? 'Hide' : 'Show'} Background
            </button>
          </div>

          <div id="print-header" className="print-fixed-header" aria-hidden="true">
            <img src={logoSrc} alt={BRAND.name} />
            <div className="print-head-meta">
              <div className="h1">{timeline.event?.code} — {timeline.event?.title}</div>
              <div className="h2">
                {timeline.event?.date && new Date(timeline.event.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
                {progress && ` • Overall ${progress.percentage}%`}
              </div>
            </div>
          </div>

          <div className="block-card p-8 mb-6 border border-gray-200 print-body">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm font-medium rounded-full">
                  {timeline.event?.code}
                </span>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                  {timeline.template_key.replace('_', ' ')}
                </span>
              </div>
              <h1 className="text-4xl font-bold text-gray-900 mb-4">
                {timeline.event?.title}
              </h1>
              <div className="flex items-center gap-4 text-gray-600">
                {timeline.event?.date && (
                  <div className="flex items-center gap-2">
                    <Calendar size={20} />
                    <span className="font-medium">
                      {new Date(timeline.event.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                )}
                {timeline.event?.venue && (
                  <div className="flex items-center gap-2">
                    <MapPin size={20} />
                    <span className="font-medium">{timeline.event.venue}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6 print-kpis">
              <div className="bg-gray-50 rounded-lg p-4 flex flex-col items-center kpi">
                <ProgressRing percentage={progress?.percentage || 0} size={60} strokeWidth={6} />
                <div className="text-sm text-gray-600 text-center font-medium mt-2">
                  Overall Progress
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {progress?.completedTasks} / {progress?.totalTasks} tasks
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 flex flex-col items-center kpi">
                <ProgressRing percentage={progressByAssignee.client.percentage} size={60} strokeWidth={6} color="#3b82f6" />
                <div className="text-sm text-blue-700 text-center font-medium mt-2">
                  Client Tasks
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  {progressByAssignee.client.completedTasks} / {progressByAssignee.client.totalTasks} tasks
                </div>
              </div>

              <div className="bg-purple-50 rounded-lg p-4 flex flex-col items-center kpi">
                <ProgressRing percentage={progressByAssignee.js.percentage} size={60} strokeWidth={6} color="#a855f7" />
                <div className="text-sm text-purple-700 text-center font-medium mt-2">
                  JustSeventy Tasks
                </div>
                <div className="text-xs text-purple-600 mt-1">
                  {progressByAssignee.js.completedTasks} / {progressByAssignee.js.totalTasks} tasks
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-4 flex flex-col items-center kpi">
                <ProgressRing percentage={progressByAssignee.joint.percentage} size={60} strokeWidth={6} color="#10b981" />
                <div className="text-sm text-green-700 text-center font-medium mt-2">
                  Joint Tasks
                </div>
                <div className="text-xs text-green-600 mt-1">
                  {progressByAssignee.joint.completedTasks} / {progressByAssignee.joint.totalTasks} tasks
                </div>
              </div>

              <div className="bg-amber-50 rounded-lg p-4 flex flex-col items-center kpi">
                <ProgressRing percentage={generalProgress.percentage} size={60} strokeWidth={6} color="#f59e0b" />
                <div className="text-sm text-amber-700 text-center font-medium mt-2">
                  General Tasks
                </div>
                <div className="text-xs text-amber-600 mt-1">
                  {generalProgress.completedTasks} / {generalProgress.totalTasks} tasks
                </div>
              </div>
            </div>

            <div className="mb-4 print:hidden">
              <div className="flex items-center gap-3">
                <Filter size={18} className="text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Filter by assignee:</span>
                <button
                  onClick={() => toggleFilter('client')}
                  className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                    activeFilters.has('client')
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                      : 'bg-gray-100 text-gray-400 border-2 border-transparent'
                  }`}
                >
                  Client
                </button>
                <button
                  onClick={() => toggleFilter('js')}
                  className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                    activeFilters.has('js')
                      ? 'bg-purple-100 text-purple-700 border-2 border-purple-300'
                      : 'bg-gray-100 text-gray-400 border-2 border-transparent'
                  }`}
                >
                  JustSeventy
                </button>
                <button
                  onClick={() => toggleFilter('joint')}
                  className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                    activeFilters.has('joint')
                      ? 'bg-green-100 text-green-700 border-2 border-green-300'
                      : 'bg-gray-100 text-gray-400 border-2 border-transparent'
                  }`}
                >
                  Both
                </button>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> You can check off tasks assigned to you (marked as "client" or "both").
                Tasks marked "js\" are managed by JustSeventy.
              </p>
            </div>
          </div>

          <div className="space-y-4 print-columns">
            {timeline.blocks?.filter(b => !b.is_general).map((block) => {
              const blockProgress = block.tasks ? calculateBlockProgress(block.tasks) : null;
              const isExpanded = expandedBlocks.has(block.id);

              return (
                <div key={block.id} className="block-card border border-gray-200 print-block">
                  <h2 className="block-title hidden print:block">{block.title}</h2>
                  <button
                    onClick={() => toggleBlock(block.id)}
                    className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50/50 transition-colors print:hidden"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      {blockProgress && <ProgressRing percentage={blockProgress.percentage} size={70} />}
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900">{block.title}</h3>
                        {blockProgress && (
                          <p className="text-sm text-gray-600 mt-1">
                            {blockProgress.completedTasks} of {blockProgress.totalTasks} tasks complete
                          </p>
                        )}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                  </button>

                  {isExpanded && block.tasks && (
                    <div className="px-6 pb-6 space-y-3">
                      {block.tasks.filter(isTaskVisible).map((task) => {
                        const canToggle = task.assignee === 'client' || task.assignee === 'joint';

                        return (
                          <div
                            key={task.id}
                            className="task-card flex items-start gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={task.done}
                              onChange={() => handleTaskToggle(task)}
                              disabled={!canToggle}
                              className={`mt-1 w-6 h-6 rounded border-gray-300 text-blue-600 focus:ring-blue-500 print:w-4 print:h-4 ${
                                canToggle ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                              }`}
                            />
                            <div className="flex-1">
                              <p className={`task-title text-gray-900 font-medium ${task.done ? 'line-through opacity-60' : ''}`}>
                                {task.title}
                              </p>
                              <div className="task-meta flex items-center gap-2 mt-2">
                                <span className={`px-2 py-1 text-xs font-medium rounded ${getAssigneeColor(task.assignee)}`}>
                                  {task.assignee}
                                </span>
                                {task.is_skeleton && (
                                  <span className="px-2 py-1 text-xs font-medium rounded bg-orange-100 text-orange-700">
                                    Key Task
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {timeline.blocks?.filter(b => b.is_general).map((block) => {
              const blockProgress = block.tasks ? calculateBlockProgress(block.tasks) : null;
              const isExpanded = expandedBlocks.has(block.id);
              const canAddTasks = timeline.allow_client_task_create ?? false;

              return (
                <div key={block.id} className="block-card border border-gray-200 print-block bg-gray-50">
                  <h2 className="block-title hidden print:block">{block.title}</h2>
                  <button
                    onClick={() => toggleBlock(block.id)}
                    className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-100 transition-colors print:hidden"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      {blockProgress && <ProgressRing percentage={blockProgress.percentage} size={70} />}
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900">{block.title}</h3>
                        {blockProgress && (
                          <p className="text-sm text-gray-600 mt-1">
                            {blockProgress.completedTasks} of {blockProgress.totalTasks} tasks complete
                          </p>
                        )}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                  </button>

                  {isExpanded && (
                    <div className="px-6 pb-6 space-y-3">
                      {canAddTasks && (
                        <div className="mb-4 pb-4 border-b border-gray-200">
                          {!showAddTask ? (
                            <button
                              onClick={() => setShowAddTask(true)}
                              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                            >
                              Add Task
                            </button>
                          ) : (
                            <div className="space-y-3 p-4 bg-white rounded-lg border border-gray-200">
                              <input
                                type="text"
                                value={newTaskTitle}
                                onChange={(e) => setNewTaskTitle(e.target.value)}
                                placeholder="Task title..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <input
                                type="date"
                                value={newTaskDueDate}
                                onChange={(e) => setNewTaskDueDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Due date (optional)"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={handleAddGeneralTask}
                                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setShowAddTask(false);
                                    setNewTaskTitle('');
                                    setNewTaskDueDate('');
                                  }}
                                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {block.tasks && block.tasks.filter(isTaskVisible).map((task) => {
                        const canToggle = task.assignee === 'client' || task.assignee === 'joint';

                        return (
                          <div
                            key={task.id}
                            className="task-card flex items-start gap-4 p-4 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={task.done}
                              onChange={() => handleTaskToggle(task)}
                              disabled={!canToggle}
                              className={`mt-1 w-6 h-6 rounded border-gray-300 text-blue-600 focus:ring-blue-500 print:w-4 print:h-4 ${
                                canToggle ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                              }`}
                            />
                            <div className="flex-1">
                              <p className={`task-title text-gray-900 font-medium ${task.done ? 'line-through opacity-60' : ''}`}>
                                {task.title}
                              </p>
                              <div className="task-meta flex items-center gap-2 mt-2">
                                <span className={`px-2 py-1 text-xs font-medium rounded ${getAssigneeColor(task.assignee)}`}>
                                  {task.assignee}
                                </span>
                                {task.is_skeleton && (
                                  <span className="px-2 py-1 text-xs font-medium rounded bg-orange-100 text-orange-700">
                                    Key Task
                                  </span>
                                )}
                                {task.due_date && (
                                  <span className="text-xs text-gray-500">
                                    Due: {new Date(task.due_date).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-8 text-center text-gray-600 text-sm">
            <p>Powered by JustSeventy Event Planning</p>
          </div>
        </div>
      </div>
    </div>
  );
}
