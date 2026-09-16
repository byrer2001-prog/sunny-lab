/* 压力检测：PSS-10 知觉压力量表 + 结果仪表盘 + 历史趋势
 *
 * 量表：Perceived Stress Scale, 10-item version (PSS-10)
 *   出处：Cohen, S., Kamarck, T., & Mermelstein, R. (1983).
 *         A global measure of perceived stress.
 *         Journal of Health and Social Behavior, 24(4), 385–396.
 *         DOI: 10.2307/2136404
 *   结构：10 题，五级计分（0=从不 … 4=总是），总分 0–40，分数越高表示知觉压力越大。
 *   计分：第 4、5、7、8 题为反向计分题，转换后得分 = 4 − 原始得分。
 *   分档：0–13 低 / 14–26 中等 / 27–40 高。
 *         —— 该分档为文献与临床常用的参考范围，原作者并未发布官方诊断截断值，
 *            本页仅用于自我了解，不作为诊断依据。
 *   结构效度：常被分为「无助感」（第 1、2、3、6、9、10 题）与
 *            「自我效能感」（第 4、5、7、8 题，反向）两个维度。
 */

(function () {
  'use strict';

  const ITEMS = [
    { text: '你有多久因为发生意外的事情而感到心烦意乱？', reverse: false },
    { text: '你有多久感到无法控制生活中重要的事情？', reverse: false },
    { text: '你有多久感到紧张不安、「压力山大」？', reverse: false },
    { text: '你有多久对自己处理个人问题的能力感到自信？', reverse: true },
    { text: '你有多久感到事情正按你的意愿发展？', reverse: true },
    { text: '你有多久发现自己无法应付所有必须做的事情？', reverse: false },
    { text: '你有多久能够控制生活中的烦恼？', reverse: true },
    { text: '你有多久感到自己掌控着局面？', reverse: true },
    { text: '你有多久因为一些无法控制的事情而生气？', reverse: false },
    { text: '你有多久感到困难堆积得太多，以至于无法克服？', reverse: false },
  ];
  const OPTIONS = ['从不', '几乎不', '有时', '经常', '总是']; // 分值 0-4
  const MAX_SCORE = ITEMS.length * 4; // 40

  // 两个维度的题目下标（题号为 1-based）
  const HELPLESSNESS = [0, 1, 2, 5, 8, 9]; // 第 1、2、3、6、9、10 题
  const SELF_EFFICACY = [3, 4, 6, 7];      // 第 4、5、7、8 题（反向）

  const questionsEl = document.getElementById('questions');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const submitBtn = document.getElementById('submit-btn');
  const resultEl = document.getElementById('result');
  const navBtns = document.getElementById('nav-btns');

  let current = 0;
  let answers = new Array(ITEMS.length).fill(null);
  let advanceTimer = null;
  let gaugeChart = null;
  let historyChart = null;

  // 反向计分：4 − 原始得分（正向题原样返回）
  function itemScore(index) {
    const raw = answers[index];
    return ITEMS[index].reverse ? 4 - raw : raw;
  }

  /* ---------- 渲染题目 ---------- */
  function renderQuestions() {
    questionsEl.innerHTML = ITEMS.map((item, i) => `
      <div class="question ${i === 0 ? 'active' : ''}" data-index="${i}">
        <h2 style="font-size: 1.15rem; font-weight: 700; color: var(--text-strong); margin: 0 0 1rem;">
          ${i + 1}. ${item.text}
        </h2>
        ${OPTIONS.map((label, p) => `
          <label class="option" data-point="${p}">
            <input type="radio" name="q${i}" data-point="${p}">
            <span>${label}</span>
          </label>
        `).join('')}
      </div>
    `).join('');
  }

  function currentQuestionEl() {
    return questionsEl.querySelector(`[data-index="${current}"]`);
  }

  function updateProgress() {
    progressBar.style.width = `${(current / ITEMS.length) * 100}%`;
    progressText.textContent = `${Math.min(current + 1, ITEMS.length)} / ${ITEMS.length}`;
  }

  function syncSelection() {
    const qEl = currentQuestionEl();
    qEl.querySelectorAll('.option').forEach(opt => {
      const point = Number(opt.dataset.point);
      const checked = answers[current] === point;
      opt.classList.toggle('selected', checked);
      opt.querySelector('input').checked = checked;
    });
  }

  function goTo(index) {
    if (index < 0 || index >= ITEMS.length) return;
    clearTimeout(advanceTimer); // 取消未执行的自动跳转，避免连跳多题
    const from = currentQuestionEl();
    from.classList.remove('active');
    current = index;
    const to = currentQuestionEl();
    to.classList.add('active');
    syncSelection();
    updateProgress();

    prevBtn.classList.toggle('hidden', current === 0);
    const isLast = current === ITEMS.length - 1;
    nextBtn.classList.toggle('hidden', isLast);
    submitBtn.classList.toggle('hidden', !isLast);
  }

  function answer(point) {
    const index = current;
    answers[index] = point;
    syncSelection();
    // 稍作停顿后自动跳到下一题（最后一题不自动跳）
    clearTimeout(advanceTimer);
    if (index < ITEMS.length - 1) {
      advanceTimer = setTimeout(() => goTo(index + 1), 300);
    }
  }

  /* ---------- 结果分档 ---------- */
  function scoreLevel(score) {
    if (score <= 13) return {
      title: '🌤 知觉压力水平：低',
      color: '#22c55e',
      desc: '你的 PSS-10 得分为低压力区间。你目前较少感到失控或不堪重负，状态比较稳定。',
      suggest: ['保持现有的作息与节奏，它对你的状态是有支撑的', '继续维持运动与社交习惯，这是成本最低的缓冲', '留意重大变化（考研、求职、搬迁）前后的状态波动'],
    };
    if (score <= 26) return {
      title: '⛅ 知觉压力水平：中等',
      color: '#f59e0b',
      desc: '你的 PSS-10 得分处于中等区间，说明你已经在相当一部分时间里感到事情难以掌控或超出负荷。这是大学生中最常见的一档，不代表状态有问题，但值得主动调整。',
      suggest: ['先把睡眠稳住，睡眠不足会显著放大压力感受', '试试「解压方法」页的呼吸训练，每次 3–5 分钟即可', '把堆积的事情写下来拆成小步骤，失控感往往来自「一团乱」而非事情本身', '和信任的人聊一次，倾诉本身就是有效的减压方式'],
    };
    return {
      title: '🌧 知觉压力水平：高',
      color: '#ef4444',
      desc: '你的 PSS-10 得分处于高压力区间，意味着你在大多数时间里都感到事情难以掌控、超出承受范围。这个状态持续下去会明显影响睡眠、情绪与专注力，值得认真对待。',
      suggest: ['优先保证睡眠，避免用熬夜换进度', '有意识地减少压力源，允许自己降低一部分期待', '规律运动，每周 3 次以上、每次 20 分钟以上即有效', '把「我扛不住了」当作需要帮助的信号，而不是需要克服的软弱', '前往「心情树洞」页查看校内外免费求助渠道，必要时预约专业咨询'],
    };
  }

  /* ---------- 结果渲染 ---------- */
  function renderDimensions() {
    const helpless = HELPLESSNESS.reduce((s, i) => s + itemScore(i), 0);
    const efficacy = SELF_EFFICACY.reduce((s, i) => s + itemScore(i), 0);
    document.getElementById('dim-helpless').textContent = `${helpless} / 24`;
    document.getElementById('dim-efficacy').textContent = `${efficacy} / 16`;

    // 一句解读：哪一维度更突出
    const helplessRate = helpless / 24;
    const efficacyRate = efficacy / 16;
    let note;
    if (helplessRate - efficacyRate > 0.15) {
      note = '你的压力更多来自「无助感」——感到事情不受自己控制。把任务拆小、拿回掌控感通常比单纯放松更有效。';
    } else if (efficacyRate - helplessRate > 0.15) {
      note = '你的压力更多来自「自我效能感」偏低——对能否处理好问题缺乏信心。回顾过去解决过的类似问题，往往比空想更能恢复信心。';
    } else {
      note = '两个维度得分比较接近，说明你的压力既有「事情失控」的部分，也有「信心不足」的部分。';
    }
    document.getElementById('dim-note').textContent = note;
  }

  function renderGauge(score, color) {
    if (gaugeChart) gaugeChart.destroy();
    const canvas = document.getElementById('gaugeChart');
    const { grid } = window.chartColors();
    gaugeChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [score, MAX_SCORE - score],
          backgroundColor: [color, grid || 'rgba(147,51,234,0.08)'],
          borderWidth: 0,
          circumference: 270,
          rotation: 225,
          borderRadius: 8,
        }],
      },
      options: {
        responsive: false,
        cutout: '78%',
        animation: { animateRotate: true, duration: 1200, easing: 'easeOutQuart' },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
    window.countUp(document.getElementById('gauge-score'), score, 1200);
  }

  async function submit() {
    // 校验是否有漏答，定位到第一道未作答的题目
    const missing = answers.findIndex(a => a === null);
    if (missing !== -1) {
      window.toast(`第 ${missing + 1} 题还没有作答哦～`, 'info', 3000);
      goTo(missing);
      return;
    }

    // PSS-10 计分：反向题转换后求和
    const score = ITEMS.reduce((sum, _, i) => sum + itemScore(i), 0);
    const level = scoreLevel(score);

    // 保存测评历史（失败不影响结果展示）。scale 字段用于区分量表口径，
    // 历史分值只在同一量表内可比。
    try {
      await window.api.post('/api/assessments', { score, scale: 'PSS-10' });
    } catch (err) {
      console.warn('测评记录保存失败:', err.message);
    }

    document.getElementById('result-title').textContent = level.title;
    document.getElementById('result-desc').textContent = level.desc;
    document.getElementById('suggest-list').innerHTML =
      level.suggest.map(s => `<li>${window.escapeHtml(s)}</li>`).join('');
    renderDimensions();

    questionsEl.classList.add('hidden');
    navBtns.classList.add('hidden');
    resultEl.classList.remove('hidden');
    progressBar.style.width = '100%';

    renderGauge(score, level.color);
    await renderHistory();
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- 历史趋势 ---------- */
  async function renderHistory() {
    let list = [];
    try {
      list = await window.api.get('/api/assessments');
    } catch { /* 静默失败 */ }

    // 只画 PSS-10 记录：旧版 8 题量表的分数是 0–24 口径，混在同一条轴上会失真
    list = list.filter(r => r.scale === 'PSS-10');

    const section = document.getElementById('history-section');
    if (list.length < 2) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    if (historyChart) historyChart.destroy();
    const { text, grid } = window.chartColors();
    historyChart = new Chart(document.getElementById('historyChart'), {
      type: 'line',
      data: {
        labels: list.map(r => new Date(r.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })),
        datasets: [{
          label: 'PSS-10 总分',
          data: list.map(r => r.score),
          borderColor: '#a855f7',
          backgroundColor: 'rgba(168,85,247,0.15)',
          pointBackgroundColor: '#9333ea',
          pointRadius: 5,
          tension: 0.35,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: MAX_SCORE, grid: { color: grid }, ticks: { color: text } },
          x: { grid: { display: false }, ticks: { color: text } },
        },
      },
    });
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    // 选项选择（监听 change 而非 click：点击 label 会额外触发一次转发给 input 的 click，
    // 用 click 委托会导致同一道题被作答两次、直接跳过一题）
    questionsEl.addEventListener('change', e => {
      const input = e.target.closest('input[type="radio"]');
      if (!input) return;
      answer(Number(input.dataset.point));
    });

    nextBtn.addEventListener('click', () => {
      if (answers[current] === null) {
        window.toast('请选择一个选项后再继续～', 'info');
        return;
      }
      goTo(current + 1);
    });
    prevBtn.addEventListener('click', () => goTo(current - 1));
    submitBtn.addEventListener('click', submit);

    // 重新测试
    document.getElementById('restart-btn').addEventListener('click', () => {
      current = 0;
      answers = new Array(ITEMS.length).fill(null);
      resultEl.classList.add('hidden');
      navBtns.classList.remove('hidden');
      questionsEl.classList.remove('hidden');
      goTo(0);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 清空历史
    document.getElementById('clear-history').addEventListener('click', async () => {
      if (!confirm('确定清空所有测评记录吗？')) return;
      try {
        await window.api.del('/api/assessments');
        if (historyChart) { historyChart.destroy(); historyChart = null; }
        document.getElementById('history-section').classList.add('hidden');
        window.toast('测评记录已清空', 'success');
      } catch (err) {
        window.toast(err.message, 'error');
      }
    });

    // 键盘操作：1-5 选择，Enter 下一题/提交
    document.addEventListener('keydown', e => {
      if (!resultEl.classList.contains('hidden')) return;
      if (e.key >= '1' && e.key <= String(OPTIONS.length)) {
        answer(Number(e.key) - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!submitBtn.classList.contains('hidden')) submit();
        else nextBtn.click();
      }
    });
  }

  renderQuestions();
  bindEvents();
  updateProgress();
})();
