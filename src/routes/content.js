'use strict';

const express = require('express');
const logger = require('../utils/logger');
const { dbGet, dbAll, dbRun } = require('../utils/dbAsync');
const authenticate = require('../middleware/authenticate');
const { tieredRateLimit } = require('../middleware/rateLimits');
const { getSystemApiKey } = require('../storage/systemSettings');
const {
  readSystemSettings,
  getDefaultSystemSettings,
} = require('../storage/systemSettings');
const { CLAUDE_API_KEY } = require('../config/env');
const {
  ensureFetch,
  requestClaudeMessages,
  resolveClaudeKey,
} = require('../integrations/claude');

const router = express.Router();
router.use(authenticate);

// Claude API calls are heavy; CRUD reads/writes on saved drafts are cheap.
const claudeLimit = tieredRateLimit('heavy');

const CLAUDE_SYSTEM_PROMPT = `Your Job is to create a press release to advertise the service. Check the given Website in exact link. Parse 3 info: Website, Author, Primary service provided.
Find the Google Business related to it and cross check the website is correct.
Check what the website is about. Find the keywords and topics of the websites and main services.
Check where the services are needed and who needs the service. Check Current Date, any recent news for "problems" for stats and to provide the service as solution option.
Reference news date range must be within last 2 months max from today. Mention the news in the press release.
Max: 700-800 Words.

Structure:
PR Title (100 Characters) Title must adhere to current time / season / situation
PR Subtitle (150 Characters)
PR Body - 700 Words
Must mention Keyword / Service, a naked link of the website to link to, author, and 1 sentence saying "Contact (website company name)"
Sources - 5 sources max, in APA style.`;

function pickClaudeKey() {
  return resolveClaudeKey(getSystemApiKey('claude'));
}

function extractText(data) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  return blocks
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n\n')
    .trim();
}

// ---- Press Release ----
router.post('/press-release', claudeLimit, async (req, res) => {
  try {
    const { website, author, service } = req.body || {};
    const claudeKey = pickClaudeKey();
    if (!claudeKey) {
      return res.status(503).json({ error: 'Claude API is not configured by the administrator.' });
    }
    const safeWebsite = String(website || '').trim();
    const safeAuthor = String(author || '').trim();
    const safeService = String(service || '').trim();
    if (!safeWebsite || !safeAuthor || !safeService) {
      return res.status(400).json({ error: 'Website, author, and service are required.' });
    }

    const data = await requestClaudeMessages(
      {
        temperature: 1,
        system: CLAUDE_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: `${safeWebsite}\n${safeAuthor}\n${safeService}` }],
          },
        ],
      },
      claudeKey,
    );
    const output = extractText(data);

    let insertedId = null;
    if (output) {
      try {
        const result = await dbRun(
          'INSERT INTO press_releases (user_id, website, author, service, content, status) VALUES (?, ?, ?, ?, ?, ?)',
          [req.user.id, safeWebsite, safeAuthor, safeService, output, 'ready'],
        );
        insertedId = result.lastID;
      } catch (err) {
        logger.error({ err }, 'Failed to save press release history');
      }
    }
    res.json({ success: true, content: output || '', id: insertedId });
  } catch (err) {
    logger.error({ err }, 'Press release generation failed');
    res.status(err.status || 500).json({ error: err.message || 'Unable to generate press release.' });
  }
});

router.get('/press-release/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const { search } = req.query;
    let query = `SELECT id, website, author, service, content, status, created_at, updated_at
                 FROM press_releases WHERE user_id = ?`;
    const params = [userId];
    if (search && search.trim()) {
      query += ' AND (service LIKE ? OR website LIKE ? OR author LIKE ? OR content LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    query += ' ORDER BY created_at DESC LIMIT 100';
    const items = await dbAll(query, params);
    res.json({ items });
  } catch (err) {
    logger.error({ err }, 'Press release history failed');
    res.status(500).json({ error: 'Failed to load history.' });
  }
});

router.get('/press-release/:id', async (req, res) => {
  try {
    const item = await dbGet(
      `SELECT id, website, author, service, content, status, created_at, updated_at
       FROM press_releases WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id],
    );
    if (!item) return res.status(404).json({ error: 'Press release not found.' });
    res.json({ item });
  } catch (err) {
    logger.error({ err }, 'Press release fetch failed');
    res.status(500).json({ error: 'Failed to load press release.' });
  }
});

router.put('/press-release/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { content, status } = req.body || {};
    const existing = await dbGet(
      'SELECT id FROM press_releases WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    if (!existing) return res.status(404).json({ error: 'Press release not found.' });

    const updates = [];
    const params = [];
    if (typeof content === 'string') {
      updates.push('content = ?');
      params.push(content);
    }
    if (typeof status === 'string' && ['in_progress', 'ready', 'done'].includes(status)) {
      updates.push('status = ?');
      params.push(status);
    }
    if (!updates.length) return res.status(400).json({ error: 'No valid fields to update.' });
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, userId);
    await dbRun(
      `UPDATE press_releases SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      params,
    );
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Press release update failed');
    res.status(500).json({ error: 'Failed to update press release.' });
  }
});

router.delete('/press-release/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM press_releases WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Press release delete failed');
    res.status(500).json({ error: 'Failed to delete press release.' });
  }
});

// ---- Blog Post ----
router.post('/blog-post', claudeLimit, async (req, res) => {
  try {
    const { website, wordCount, topic } = req.body || {};
    const claudeKey = pickClaudeKey();
    if (!claudeKey) {
      return res.status(503).json({ error: 'Claude API is not configured by the administrator.' });
    }
    const safeWebsite = String(website || '').trim();
    const safeTopic = String(topic || '').trim();
    const safeWordCount = parseInt(wordCount, 10) || 1000;
    if (!safeWebsite || !safeTopic) {
      return res.status(400).json({ error: 'Website and topic are required.' });
    }
    if (safeWordCount < 100 || safeWordCount > 5000) {
      return res.status(400).json({ error: 'Word count must be between 100 and 5000.' });
    }

    const systemSettings = readSystemSettings();
    const blogPrompt =
      systemSettings.prompts?.blogPost || getDefaultSystemSettings().prompts.blogPost;

    const data = await requestClaudeMessages(
      {
        temperature: 1,
        system: blogPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Website: ${safeWebsite}\nWord Count: ${safeWordCount}\nTopic/Keyword: ${safeTopic}`,
              },
            ],
          },
        ],
      },
      claudeKey,
    );
    const output = extractText(data);

    let insertedId = null;
    if (output) {
      try {
        const result = await dbRun(
          'INSERT INTO blog_posts (user_id, website, word_count, topic, content, status) VALUES (?, ?, ?, ?, ?, ?)',
          [req.user.id, safeWebsite, safeWordCount, safeTopic, output, 'ready'],
        );
        insertedId = result.lastID;
      } catch (err) {
        logger.error({ err }, 'Failed to save blog post history');
      }
    }
    res.json({ content: output, id: insertedId });
  } catch (err) {
    logger.error({ err }, 'Blog post generation failed');
    res.status(err.status || 500).json({ error: err.message || 'Unable to generate blog post.' });
  }
});

router.get('/blog-post/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const { search } = req.query;
    let query = `SELECT id, website, word_count, topic, content, status, created_at, updated_at
                 FROM blog_posts WHERE user_id = ?`;
    const params = [userId];
    if (search && search.trim()) {
      query += ' AND (topic LIKE ? OR website LIKE ? OR content LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    query += ' ORDER BY created_at DESC LIMIT 100';
    const items = await dbAll(query, params);
    res.json({ items });
  } catch (err) {
    logger.error({ err }, 'Blog post history failed');
    res.status(500).json({ error: 'Failed to load history.' });
  }
});

router.get('/blog-post/:id', async (req, res) => {
  try {
    const item = await dbGet(
      `SELECT id, website, word_count, topic, content, status, created_at, updated_at
       FROM blog_posts WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id],
    );
    if (!item) return res.status(404).json({ error: 'Blog post not found.' });
    res.json({ item });
  } catch (err) {
    logger.error({ err }, 'Blog post fetch failed');
    res.status(500).json({ error: 'Failed to load blog post.' });
  }
});

router.put('/blog-post/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { content, status } = req.body || {};
    const existing = await dbGet(
      'SELECT id FROM blog_posts WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    if (!existing) return res.status(404).json({ error: 'Blog post not found.' });

    const updates = [];
    const params = [];
    if (typeof content === 'string') {
      updates.push('content = ?');
      params.push(content);
    }
    if (typeof status === 'string' && ['in_progress', 'ready', 'done'].includes(status)) {
      updates.push('status = ?');
      params.push(status);
    }
    if (!updates.length) return res.status(400).json({ error: 'No valid fields to update.' });
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id, userId);
    await dbRun(
      `UPDATE blog_posts SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      params,
    );
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Blog post update failed');
    res.status(500).json({ error: 'Failed to update blog post.' });
  }
});

router.delete('/blog-post/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM blog_posts WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Blog post delete failed');
    res.status(500).json({ error: 'Failed to delete blog post.' });
  }
});

// ---- Beyond Intent (generic Claude passthrough) ----
router.post('/beyond-intent/generate', claudeLimit, async (req, res) => {
  try {
    const { systemPrompt, userPrompt } = req.body || {};
    const claudeKey = pickClaudeKey();
    if (!claudeKey) {
      return res.status(503).json({ error: 'Claude API is not configured by the administrator.' });
    }
    if (!systemPrompt || !userPrompt) {
      return res.status(400).json({ error: 'Both systemPrompt and userPrompt are required.' });
    }

    const data = await requestClaudeMessages(
      {
        temperature: 1,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      claudeKey,
    );
    const content = extractText(data);
    if (!content) return res.status(500).json({ error: 'No content received from Claude.' });
    res.json({ content });
  } catch (err) {
    logger.error({ err }, 'Beyond Intent generation failed');
    res.status(500).json({ error: err.message || 'Failed to generate content.' });
  }
});

module.exports = router;
