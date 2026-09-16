/* 解压页：呼吸训练（精确分相计时 + 进度环）+ 音频互斥播放 */

(function () {
  'use strict';

  /* ================= 呼吸训练 ================= */

  // 呼吸模式：[{ label, phases: [{name, text, seconds, scale}] }]
  const PATTERNS = [
    {
      id: 'relax', name: '🌿 经典放松', desc: '吸 4s · 屏 4s · 呼 6s',
      phases: [
        { text: '吸气', seconds: 4, scale: 1.25 },
        { text: '屏息', seconds: 4, scale: 1.25 },
        { text: '呼气', seconds: 6, scale: 1.0 },
      ],
    },
    {
      id: '478', name: '🌙 4-7-8 助眠', desc: '吸 4s · 屏 7s · 呼 8s',
      phases: [
        { text: '吸气', seconds: 4, scale: 1.25 },
        { text: '屏息', seconds: 7, scale: 1.25 },
        { text: '呼气', seconds: 8, scale: 1.0 },
      ],
    },
    {
      id: 'box', name: '📦 箱式呼吸', desc: '吸 4s · 屏 4s · 呼 4s · 屏 4s',
      phases: [
        { text: '吸气', seconds: 4, scale: 1.25 },
        { text: '屏息', seconds: 4, scale: 1.25 },
        { text: '呼气', seconds: 4, scale: 1.0 },
        { text: '屏息', seconds: 4, scale: 1.0 },
      ],
    },
  ];

  const circle = document.getElementById('breath-circle');
  const ringFg = document.getElementById('ring-fg');
  const phaseText = document.getElementById('phase-text');
  const phaseCount = document.getElementById('phase-count');
  const startBtn = document.getElementById('start-breath');
  const pauseBtn = document.getElementById('pause-breath');
  const resetBtn = document.getElementById('reset-breath');
  const cycleCountEl = document.getElementById('cycle-count');
  const sessionTimeEl = document.getElementById('session-time');
  const patternList = document.getElementById('pattern-list');

  const RING_LEN = 766.5; // 2πr, r=122

  let pattern = PATTERNS[0];
  let running = false;
  let phaseIndex = 0;
  let phaseEndsAt = 0;   // 当前阶段结束的时间戳（performance.now 基准）
  let rafId = null;
  let cycles = 0;
  let sessionSeconds = 0;
  let sessionTimer = null;

  // 圆环缩放的过渡时长需跟随当前阶段时长
  function setCircleScale(scale, seconds) {
    circle.style.transitionDuration = `${seconds}s`;
    circle.style.transform = `scale(${scale})`;
  }

  function tick() {
    if (!running) return;
    const now = performance.now();
    const phase = pattern.phases[phaseIndex];
    const totalMs = phase.seconds * 1000;
    const remainMs = phaseEndsAt - now;

    if (remainMs <= 0) {
      // 进入下一阶段
      phaseIndex = (phaseIndex + 1) % pattern.phases.length;
      if (phaseIndex === 0) {
        cycles += 1;
        cycleCountEl.textContent = cycles;
      }
      startPhase();
      return;
    }

    // 倒计时数字（向上取整，阶段开始显示完整秒数）
    phaseCount.textContent = Math.ceil(remainMs / 1000);
    // 进度环：本阶段已进行的比例
    const progress = 1 - remainMs / totalMs;
    ringFg.style.strokeDashoffset = RING_LEN * (1 - progress);

    rafId = requestAnimationFrame(tick);
  }

  function startPhase() {
    const phase = pattern.phases[phaseIndex];
    phaseText.textContent = `${phase.text}...`;
    phaseCount.textContent = phase.seconds;
    setCircleScale(phase.scale, phase.text === '屏息' ? 0.3 : phase.seconds);
    phaseEndsAt = performance.now() + phase.seconds * 1000;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function formatTime(s) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function startSessionTimer() {
    sessionTimer = setInterval(() => {
      sessionSeconds += 1;
      sessionTimeEl.textContent = formatTime(sessionSeconds);
    }, 1000);
  }

  function start() {
    running = true;
    phaseIndex = 0;
    startBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    resetBtn.classList.remove('hidden');
    startPhase();
    startSessionTimer();
  }

  function pause() {
    running = false;
    cancelAnimationFrame(rafId);
    clearInterval(sessionTimer);
    pauseBtn.classList.add('hidden');
    startBtn.classList.remove('hidden');
    startBtn.textContent = '▶ 继续';
    phaseText.textContent = '已暂停';
    phaseCount.textContent = '';
    circle.style.transitionDuration = '0.6s';
    circle.style.transform = 'scale(1)';
    ringFg.style.strokeDashoffset = RING_LEN;
  }

  function reset() {
    pause();
    startBtn.textContent = '▶ 开始训练';
    resetBtn.classList.add('hidden');
    phaseText.textContent = '准备开始';
    cycles = 0;
    sessionSeconds = 0;
    cycleCountEl.textContent = '0';
    sessionTimeEl.textContent = '0:00';
  }

  // “继续”时从当前模式的第一阶段重新开始（简单可靠）
  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', pause);
  resetBtn.addEventListener('click', reset);

  // 页面隐藏时自动暂停，避免计时漂移
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running) pause();
  });

  /* ---------- 模式选择 ---------- */
  function renderPatterns() {
    patternList.innerHTML = '';
    PATTERNS.forEach(p => {
      const item = document.createElement('div');
      item.className = `pattern-item ${p.id === pattern.id ? 'active' : ''}`;
      item.innerHTML = `
        <div>
          <div class="pattern-name">${p.name}</div>
          <div class="pattern-rhythm">${p.desc}</div>
        </div>
        <span class="badge">${p.phases.reduce((s, x) => s + x.seconds, 0)}s / 循环</span>
      `;
      item.addEventListener('click', () => {
        if (running) pause();
        pattern = p;
        renderPatterns();
        reset();
        window.toast(`已切换到「${p.name.replace(/^\S+\s/, '')}」`, 'success');
      });
      patternList.appendChild(item);
    });
  }
  renderPatterns();

  /* ================= 音频互斥播放 ================= */
  const audios = document.querySelectorAll('.audio-card audio');
  audios.forEach(audio => {
    const card = audio.closest('.audio-card');
    const status = card.querySelector('.status');
    audio.addEventListener('play', () => {
      audios.forEach(other => { if (other !== audio) other.pause(); });
      card.classList.add('playing');
      status.className = 'status playing-dot';
    });
    audio.addEventListener('pause', () => {
      card.classList.remove('playing');
      status.className = 'status';
    });
    audio.addEventListener('ended', () => {
      card.classList.remove('playing');
      status.className = 'status';
    });
  });
})();
