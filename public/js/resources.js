/* 资源页：数据概览 / 心情日记 CRUD（心情标签 · 编辑 · 搜索 · 情绪趋势）/ 号码复制 */

(function () {
  'use strict';

  const MOODS = [
    { key: 'great',   emoji: '😄', label: '开心', score: 5, color: '#22c55e' },
    { key: 'good',    emoji: '🙂', label: '不错', score: 4, color: '#84cc16' },
    { key: 'calm',    emoji: '😌', label: '平静', score: 3, color: '#a855f7' },
    { key: 'anxious', emoji: '😰', label: '焦虑', score: 2, color: '#f59e0b' },
    { key: 'sad',     emoji: '😢', label: '低落', score: 1, color: '#ef4444' },
  ];
  const moodOf = key => MOODS.find(m => m.key === key) || MOODS[2];

  const contentEl = document.getElementById('diary-content');
  const saveBtn = document.getElementById('save-diary');
  const listEl = document.getElementById('diary-list');
  const emptyEl = document.getElementById('empty-diary');
  const emptyTextEl = document.getElementById('empty-diary-text');
  const countEl = document.getElementById('diary-count');
  const searchEl = document.getElementById('diary-search');

  let selectedMood = 'calm';
  let diaries = [];
  let trendChart = null;

  /* ---------- 心情选择器 ---------- */
  function renderMoodPicker() {
    const picker = document.getElementById('mood-picker');
    picker.innerHTML = '';
    MOODS.forEach(m => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `mood-btn ${m.key === selectedMood ? 'selected' : ''}`;
      btn.innerHTML = `${m.emoji}<span class="mood-label">${m.label}</span>`;
      btn.addEventListener('click', () => {
        selectedMood = m.key;
        renderMoodPicker();
      });
      picker.appendChild(btn);
    });
  }

  /* ---------- 数据概览 ---------- */
  function renderStats(assessments) {
    // 日记总数
    const diaryEl = document.getElementById('stat-diary');
    if (diaryEl.textContent !== String(diaries.length)) {
      window.countUp(diaryEl, diaries.length, 800);
    }

    // 连续记录天数（从今天或昨天往前推）
    const daysWithDiary = new Set(diaries.map(d => new Date(d.createdAt).toDateString()));
    let streak = 0;
    const cursor = new Date();
    if (!daysWithDiary.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1); // 今天还没写，从昨天算
    while (daysWithDiary.has(cursor.toDateString())) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    const streakEl = document.getElementById('stat-streak');
    if (streakEl.textContent !== String(streak)) window.countUp(streakEl, streak, 800);

    // 近 7 天平均心情
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = diaries.filter(d => d.createdAt >= weekAgo);
    const moodEl = document.getElementById('stat-mood');
    if (recent.length) {
      const avg = recent.reduce((s, d) => s + moodOf(d.mood).score, 0) / recent.length;
      const nearest = MOODS.reduce((best, m) =>
        Math.abs(m.score - avg) < Math.abs(best.score - avg) ? m : best);
      moodEl.textContent = `${nearest.emoji} ${avg.toFixed(1)}`;
    } else {
      moodEl.textContent = '—';
    }

    // 最近一次压力测评（仅统计 PSS-10 记录：旧版 8 题量表的分数不是同一口径，
    // 混进来会得到错误的分级和不可比的数值）
    const scoreEl = document.getElementById('stat-score');
    const pssList = assessments.filter(a => a.scale === 'PSS-10');
    if (pssList.length) {
      const latest = pssList[pssList.length - 1];
      // PSS-10 分级：0–13 低 / 14–26 中等 / 27–40 高（常用参考范围，非诊断截断值）
      const level = latest.score <= 13 ? '低' : latest.score <= 26 ? '中等' : '高';
      scoreEl.textContent = `${latest.score}`;
      scoreEl.title = `PSS-10 知觉压力水平：${level}（总分 0–40）`;
    } else {
      scoreEl.textContent = '—';
      scoreEl.title = '还没有 PSS-10 测评记录';
    }
  }

  /* ---------- 数据加载 ---------- */
  async function loadDiaries() {
    let assessments = [];
    try {
      diaries = await window.api.get('/api/diaries');
    } catch (err) {
      window.toast(`日记加载失败：${err.message}，请确认服务器已启动`, 'error', 4000);
      diaries = [];
    }
    try {
      assessments = await window.api.get('/api/assessments');
    } catch { /* 概览统计静默降级 */ }

    renderStats(assessments);
    renderDiaries();
    renderMoodTrend();
  }

  function renderDiaries() {
    const keyword = searchEl.value.trim().toLowerCase();
    const filtered = keyword
      ? diaries.filter(d => d.content.toLowerCase().includes(keyword))
      : diaries;

    countEl.textContent = filtered.length ? `${filtered.length} 篇` : '';
    emptyEl.classList.toggle('hidden', filtered.length > 0);
    // 只更新文字，保留插画
    emptyTextEl.textContent = keyword
      ? `没有找到包含「${keyword}」的日记`
      : '暂无日记，开始记录你的心情吧～';

    listEl.querySelectorAll('.diary-entry').forEach(el => el.remove());

    filtered.forEach(diary => {
      const mood = moodOf(diary.mood);
      const entry = document.createElement('div');
      entry.className = 'diary-entry';
      entry.dataset.id = diary.id;
      entry.style.setProperty('--mood-color', mood.color); // 时间线节点随心情着色

      const date = new Date(diary.createdAt).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });

      entry.innerHTML = `
        <div class="diary-meta">
          <span class="diary-date">${date}${diary.updatedAt > diary.createdAt ? '（已编辑）' : ''}</span>
          <span class="diary-mood-tag">${mood.emoji} ${mood.label}</span>
        </div>
        <div class="diary-content"></div>
        <div class="diary-actions">
          <button class="btn-edit">✏️ 编辑</button>
          <button class="btn-del">🗑 删除</button>
        </div>
        <div class="diary-edit-area">
          <textarea class="textarea mb-4" rows="3" maxlength="2000"></textarea>
          <div class="flex gap-2">
            <button class="btn btn-primary btn-save" style="padding: 0.4rem 1rem; font-size: 0.85rem;">保存</button>
            <button class="btn btn-ghost btn-cancel" style="padding: 0.4rem 1rem; font-size: 0.85rem;">取消</button>
          </div>
        </div>
      `;
      // 文本内容用 textContent 注入，杜绝 XSS
      entry.querySelector('.diary-content').textContent = diary.content;
      entry.querySelector('.diary-edit-area textarea').value = diary.content;

      entry.querySelector('.btn-edit').addEventListener('click', () => entry.classList.add('editing'));
      entry.querySelector('.btn-cancel').addEventListener('click', () => entry.classList.remove('editing'));
      entry.querySelector('.btn-save').addEventListener('click', () => saveEdit(diary.id, entry));
      entry.querySelector('.btn-del').addEventListener('click', e => deleteDiary(diary.id, e.currentTarget));

      listEl.appendChild(entry);
    });
  }

  /* ---------- 情绪趋势（近 14 天，按天取平均心情分） ---------- */
  function renderMoodTrend() {
    const section = document.getElementById('mood-trend-section');
    if (diaries.length < 2) { section.classList.add('hidden'); return; }

    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, start: d.getTime(), end: d.getTime() + 86400000 });
    }
    const values = days.map(day => {
      const list = diaries.filter(d => d.createdAt >= day.start && d.createdAt < day.end);
      if (!list.length) return null;
      return list.reduce((s, d) => s + moodOf(d.mood).score, 0) / list.length;
    });
    if (values.every(v => v === null)) { section.classList.add('hidden'); return; }

    section.classList.remove('hidden');
    if (trendChart) trendChart.destroy();
    const { text, grid } = window.chartColors();
    trendChart = new Chart(document.getElementById('moodTrendChart'), {
      type: 'line',
      data: {
        labels: days.map(d => d.label),
        datasets: [{
          data: values,
          borderColor: '#a855f7',
          backgroundColor: 'rgba(168,85,247,0.15)',
          pointBackgroundColor: '#9333ea',
          pointRadius: 4,
          tension: 0.35,
          fill: true,
          spanGaps: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0.5, max: 5.5, grid: { color: grid }, ticks: { color: text, stepSize: 1 } },
          x: { grid: { display: false }, ticks: { color: text, maxTicksLimit: 7 } },
        },
      },
    });
  }

  /* ---------- 增 / 改 / 删 ---------- */
  async function saveDiary() {
    const content = contentEl.value.trim();
    if (!content) {
      window.toast('先写点什么再保存吧～', 'info');
      contentEl.focus();
      return;
    }
    saveBtn.disabled = true;
    try {
      await window.api.post('/api/diaries', { content, mood: selectedMood });
      contentEl.value = '';
      searchEl.value = '';
      window.toast('日记保存成功！', 'success');
      await loadDiaries();
    } catch (err) {
      window.toast(err.message, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function saveEdit(id, entry) {
    const content = entry.querySelector('.diary-edit-area textarea').value.trim();
    if (!content) {
      window.toast('内容不能为空', 'info');
      return;
    }
    try {
      await window.api.put(`/api/diaries/${id}`, { content, mood: diaries.find(d => d.id === id)?.mood });
      window.toast('日记已更新', 'success');
      await loadDiaries();
    } catch (err) {
      window.toast(err.message, 'error');
    }
  }

  // 两段式删除：第一次点击变为“确认删除”，3 秒内未确认自动还原
  async function deleteDiary(id, btn) {
    if (!btn.classList.contains('confirming')) {
      btn.classList.add('confirming');
      btn.textContent = '⚠️ 确认删除？';
      btn._timer = setTimeout(() => {
        btn.classList.remove('confirming');
        btn.textContent = '🗑 删除';
      }, 3000);
      return;
    }
    clearTimeout(btn._timer);
    try {
      await window.api.del(`/api/diaries/${id}`);
      window.toast('日记已删除', 'success');
      await loadDiaries();
    } catch (err) {
      window.toast(err.message, 'error');
    }
  }

  /* ---------- 号码复制 ---------- */
  function initCopyButtons() {
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const value = btn.dataset.copy;
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(value);
          } else {
            // 非 HTTPS 环境（如局域网 IP 访问）降级方案
            const ta = document.createElement('textarea');
            ta.value = value;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
          }
          window.toast(`已复制 ${value}`, 'success');
        } catch {
          window.toast('复制失败，请手动记录号码', 'error');
        }
      });
    });
  }

  /* ---------- 事件 ---------- */
  saveBtn.addEventListener('click', saveDiary);
  contentEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveDiary();
    }
  });

  let searchTimer = null;
  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderDiaries, 200); // 防抖
  });

  renderMoodPicker();
  initCopyButtons();
  loadDiaries();
})();
