// ============================================================
// 心晴实验室 · 后端服务
// Express + 本地 JSON 文件存储（db.json）
// 提供：心情日记 CRUD / 压力测评历史 / 静态资源托管
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- 中间件 ----------
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true }));

// 静态资源：public（页面）+ audio（冥想音频）
app.use(express.static(path.join(__dirname, 'public')));
app.use('/audio', express.static(path.join(__dirname, 'audio')));

// ---------- 数据层（JSON 文件，原子写入） ----------
const DB_FILE = path.join(__dirname, 'db.json');
const DEFAULT_DB = { diaries: [], assessments: [] };

function readDb() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const data = JSON.parse(raw);
    return { ...DEFAULT_DB, ...data };
  } catch (err) {
    if (err.code === 'ENOENT') return { ...DEFAULT_DB };
    // 文件损坏时备份原文件，避免数据彻底丢失
    const backup = `${DB_FILE}.broken-${Date.now()}.bak`;
    try { fs.copyFileSync(DB_FILE, backup); } catch { /* 忽略备份失败 */ }
    console.error(`[db] db.json 解析失败，已备份到 ${path.basename(backup)}:`, err.message);
    return { ...DEFAULT_DB };
  }
}

function writeDb(data) {
  // 先写临时文件再重命名，避免写入中断导致 JSON 损坏
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

if (!fs.existsSync(DB_FILE)) writeDb({ ...DEFAULT_DB });

// ---------- 校验工具 ----------
function validateDiary(body) {
  const errors = [];
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const mood = typeof body.mood === 'string' ? body.mood.trim() : '';
  if (!content) errors.push('日记内容不能为空');
  if (content.length > 2000) errors.push('日记内容不能超过 2000 字');
  if (mood && !['great', 'good', 'calm', 'anxious', 'sad'].includes(mood)) {
    errors.push('无效的心情标签');
  }
  return { errors, value: { content, mood: mood || 'calm' } };
}

// ---------- 日记 API ----------
// 获取全部日记（新→旧）
app.get('/api/diaries', (req, res) => {
  const db = readDb();
  const diaries = [...db.diaries].sort((a, b) => b.createdAt - a.createdAt);
  res.json(diaries);
});

// 新增日记
app.post('/api/diaries', (req, res) => {
  const { errors, value } = validateDiary(req.body);
  if (errors.length) return res.status(400).json({ msg: errors.join('；') });

  const diary = {
    id: crypto.randomUUID(),
    content: value.content,
    mood: value.mood,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const db = readDb();
  db.diaries.push(diary);
  writeDb(db);
  res.status(201).json({ msg: '保存成功', diary });
});

// 编辑日记
app.put('/api/diaries/:id', (req, res) => {
  const { errors, value } = validateDiary(req.body);
  if (errors.length) return res.status(400).json({ msg: errors.join('；') });

  const db = readDb();
  const diary = db.diaries.find(d => d.id === req.params.id);
  if (!diary) return res.status(404).json({ msg: '日记不存在' });

  diary.content = value.content;
  diary.mood = value.mood;
  diary.updatedAt = Date.now();
  writeDb(db);
  res.json({ msg: '更新成功', diary });
});

// 删除日记
app.delete('/api/diaries/:id', (req, res) => {
  const db = readDb();
  const before = db.diaries.length;
  db.diaries = db.diaries.filter(d => d.id !== req.params.id);
  if (db.diaries.length === before) return res.status(404).json({ msg: '日记不存在' });
  writeDb(db);
  res.json({ msg: '删除成功' });
});

// ---------- 压力测评历史 API ----------
app.get('/api/assessments', (req, res) => {
  const db = readDb();
  const list = [...db.assessments].sort((a, b) => a.createdAt - b.createdAt);
  res.json(list);
});

// 各量表的合法分值范围。历史分值只在同一量表内可比，故必须记录 scale，
// 否则 8 题旧量表（0–24）与 PSS-10（0–40）的分数会被混在同一条趋势线上。
const SCALES = { 'PSS-10': 40 };

app.post('/api/assessments', (req, res) => {
  const score = Number(req.body.score);
  const scale = typeof req.body.scale === 'string' ? req.body.scale : 'PSS-10';
  const maxScore = SCALES[scale];
  if (!maxScore) {
    return res.status(400).json({ msg: `未知的量表类型：${scale}` });
  }
  if (!Number.isInteger(score) || score < 0 || score > maxScore) {
    return res.status(400).json({ msg: `无效的测评分数（${scale} 应在 0–${maxScore} 之间）` });
  }
  const record = { id: crypto.randomUUID(), score, scale, createdAt: Date.now() };
  const db = readDb();
  db.assessments.push(record);
  writeDb(db);
  res.status(201).json({ msg: '记录成功', record });
});

app.delete('/api/assessments', (req, res) => {
  const db = readDb();
  db.assessments = [];
  writeDb(db);
  res.json({ msg: '测评历史已清空' });
});

// ---------- 统计概览 ----------
app.get('/api/stats', (req, res) => {
  const db = readDb();
  // 只回报 PSS-10 的最近得分：不同量表的分数不可比
  const pssList = db.assessments.filter(a => a.scale === 'PSS-10');
  res.json({
    diaryCount: db.diaries.length,
    assessmentCount: db.assessments.length,
    pss10Count: pssList.length,
    latestScore: pssList.length ? pssList[pssList.length - 1].score : null,
    latestScale: pssList.length ? 'PSS-10' : null,
  });
});

// ---------- 404 & 错误处理 ----------
app.use('/api', (req, res) => res.status(404).json({ msg: '接口不存在' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] 未捕获错误:', err);
  res.status(500).json({ msg: '服务器内部错误' });
});

// ---------- 启动 ----------
app.listen(PORT, () => {
  console.log(`💜 心晴实验室已启动: http://localhost:${PORT}`);
});
