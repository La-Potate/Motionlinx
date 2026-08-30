'use strict';

const express = require('express');
const logger = require('../utils/logger');
const { dbGet, dbAll, dbRun } = require('../utils/dbAsync');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

// NOTE: this router is mounted at `/api` (not `/api/projects`) because its
// routes use multiple top-level paths (`/projects`, `/groups`, `/tasks`).
// A blanket `router.use(authenticate)` would therefore
// authenticate every `/api/*` request that flows past it in mount order —
// including the public site-marker share endpoint. We attach `authenticate`
// per route instead.

// ---- Projects CRUD ----
router.get('/projects', authenticate, async (req, res) => {
  try {
    const projects = await dbAll(
      `SELECT p.*,
         (SELECT COUNT(*) FROM groups g WHERE g.project_id = p.id) as group_count
       FROM projects p WHERE p.user_id = ? ORDER BY p.created_at DESC`,
      [req.user.id],
    );
    res.json({ projects });
  } catch (err) {
    logger.error({ err }, 'GET /api/projects failed');
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

router.post('/projects', authenticate, async (req, res) => {
  const { name, notes } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Project name required' });
  try {
    const result = await dbRun(
      'INSERT INTO projects (user_id, name, notes) VALUES (?, ?, ?)',
      [req.user.id, name, notes || ''],
    );
    res.json({
      message: 'Project created successfully',
      project: { id: result.lastID, name, notes: notes || '' },
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ error: 'Project with this name already exists' });
    }
    logger.error({ err }, 'Failed to create project');
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.put('/projects/:id', authenticate, async (req, res) => {
  const { name, notes } = req.body || {};
  try {
    const result = await dbRun(
      'UPDATE projects SET name = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [name, notes, req.params.id, req.user.id],
    );
    if (!result.changes) return res.status(404).json({ error: 'Project not found' });
    res.json({ message: 'Project updated successfully' });
  } catch (err) {
    logger.error({ err }, 'Failed to update project');
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/projects/:id', authenticate, async (req, res) => {
  try {
    const result = await dbRun(
      'DELETE FROM projects WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );
    if (!result.changes) return res.status(404).json({ error: 'Project not found' });
    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    logger.error({ err }, 'Failed to delete project');
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// ---- Groups ----
router.get('/projects/:projectId/groups', authenticate, async (req, res) => {
  try {
    const groups = await dbAll(
      `SELECT g.* FROM groups g
       JOIN projects p ON g.project_id = p.id
       WHERE p.id = ? AND p.user_id = ? ORDER BY g.created_at ASC`,
      [req.params.projectId, req.user.id],
    );
    res.json({ groups });
  } catch (err) {
    logger.error({ err }, 'List groups failed');
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/projects/:projectId/groups', authenticate, async (req, res) => {
  const { name, color } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Group name required' });
  try {
    const project = await dbGet('SELECT id FROM projects WHERE id = ? AND user_id = ?', [
      req.params.projectId,
      req.user.id,
    ]);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const result = await dbRun(
      'INSERT INTO groups (project_id, name, color) VALUES (?, ?, ?)',
      [req.params.projectId, name, color || '#238636'],
    );
    res.json({
      message: 'Group created successfully',
      group: { id: result.lastID, name, color: color || '#238636' },
    });
  } catch (err) {
    logger.error({ err }, 'Create group failed');
    res.status(500).json({ error: 'Failed to create group' });
  }
});

router.put('/groups/:id', authenticate, async (req, res) => {
  const { name, color } = req.body || {};
  try {
    const result = await dbRun(
      `UPDATE groups SET name = ?, color = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE user_id = ?)`,
      [name, color, req.params.id, req.user.id],
    );
    if (!result.changes) return res.status(404).json({ error: 'Group not found' });
    res.json({ message: 'Group updated successfully' });
  } catch (err) {
    logger.error({ err }, 'Update group failed');
    res.status(500).json({ error: 'Failed to update group' });
  }
});

router.delete('/groups/:id', authenticate, async (req, res) => {
  try {
    const result = await dbRun(
      `DELETE FROM groups WHERE id = ? AND project_id IN (SELECT id FROM projects WHERE user_id = ?)`,
      [req.params.id, req.user.id],
    );
    if (!result.changes) return res.status(404).json({ error: 'Group not found' });
    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    logger.error({ err }, 'Delete group failed');
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// ---- Tasks ----
router.get('/groups/:groupId/tasks', authenticate, async (req, res) => {
  try {
    const tasks = await dbAll(
      `SELECT t.* FROM tasks t
       JOIN groups g ON t.group_id = g.id
       JOIN projects p ON g.project_id = p.id
       WHERE t.group_id = ? AND p.user_id = ? ORDER BY t.created_at ASC`,
      [req.params.groupId, req.user.id],
    );
    res.json({ tasks });
  } catch (err) {
    logger.error({ err }, 'List tasks failed');
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/groups/:groupId/tasks', authenticate, async (req, res) => {
  const { title, assignee, status, date } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Task title required' });
  try {
    const group = await dbGet(
      `SELECT g.id FROM groups g
       JOIN projects p ON g.project_id = p.id
       WHERE g.id = ? AND p.user_id = ?`,
      [req.params.groupId, req.user.id],
    );
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const result = await dbRun(
      'INSERT INTO tasks (group_id, title, assignee, status, date) VALUES (?, ?, ?, ?, ?)',
      [req.params.groupId, title, assignee || 'Unassigned', status || 'Not started', date || 'Today'],
    );
    res.json({
      message: 'Task created successfully',
      task: {
        id: result.lastID,
        title,
        assignee: assignee || 'Unassigned',
        status: status || 'Not started',
        date: date || 'Today',
        comments: 0,
        attachments: 0,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Create task failed');
    res.status(500).json({ error: 'Failed to create task' });
  }
});

router.put('/tasks/:id', authenticate, async (req, res) => {
  const allowed = ['title', 'assignee', 'status', 'date', 'priority', 'labels', 'completed', 'time_spent'];
  const updates = Object.keys(req.body || {}).filter((k) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });
  const setClause = updates.map((k) => `${k} = COALESCE(?, ${k})`).join(', ');
  const params = updates.map((k) => req.body[k]);
  params.push(req.params.id, req.user.id);

  try {
    const result = await dbRun(
      `UPDATE tasks SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND group_id IN (
         SELECT g.id FROM groups g
         JOIN projects p ON g.project_id = p.id
         WHERE p.user_id = ?
       )`,
      params,
    );
    if (!result.changes) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task updated successfully' });
  } catch (err) {
    logger.error({ err }, 'Update task failed');
    res.status(500).json({ error: 'Failed to update task' });
  }
});

router.delete('/tasks/:id', authenticate, async (req, res) => {
  try {
    const result = await dbRun(
      `DELETE FROM tasks WHERE id = ? AND group_id IN (
        SELECT g.id FROM groups g
        JOIN projects p ON g.project_id = p.id
        WHERE p.user_id = ?
      )`,
      [req.params.id, req.user.id],
    );
    if (!result.changes) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    logger.error({ err }, 'Delete task failed');
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
