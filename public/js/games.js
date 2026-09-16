/* 解压游戏页：戳泡泡（Canvas 粒子）+ 情绪记忆翻牌（3D 翻转） */

(function () {
  'use strict';

  /* ==================================================
     一、Tab 切换
     ================================================== */
  const tabs = document.querySelectorAll('.game-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.game-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(tab.dataset.target).classList.add('active');

      // 离开泡泡游戏时暂停并停止动画循环，避免后台空转
      if (tab.dataset.target === 'memory-panel') bubble.pause();
    });
  });

  /* ==================================================
     二、戳泡泡
     ================================================== */
  const bubble = (() => {
    const canvas = document.getElementById('bubble-canvas');
    const ctx = canvas.getContext('2d');
    const stage = canvas.parentElement;
    const overlay = document.getElementById('bubble-overlay');
    const overlayTitle = document.getElementById('bubble-overlay-title');
    const overlayText = document.getElementById('bubble-overlay-text');
    const startBtn = document.getElementById('bubble-start');
    const scoreEl = document.getElementById('bubble-score');
    const timeEl = document.getElementById('bubble-time');
    const bestEl = document.getElementById('bubble-best');

    const DURATION = 60;              // 单局秒数
    const BEST_KEY = 'sunny-lab-bubble-best';
    const HUES = [280, 265, 300, 200, 320, 160]; // 柔和的紫/粉/青

    let bubbles = [];
    let particles = [];
    let score = 0;
    let timeLeft = DURATION;
    let running = false;
    let rafId = null;
    let lastSpawn = 0;
    let lastPopAt = 0;
    let combo = 1;
    let secondTimer = null;
    let width = 0;
    let height = 380;

    bestEl.textContent = localStorage.getItem(BEST_KEY) || '0';

    // 适配高分屏，避免模糊
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = stage.clientWidth;
      height = Number(canvas.getAttribute('height')) || 380;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn() {
      const r = 16 + Math.random() * 26;
      bubbles.push({
        x: r + Math.random() * Math.max(width - r * 2, 1),
        y: height + r,
        r,
        vy: -(0.5 + Math.random() * 0.9) - r / 90, // 大泡泡升得稍快
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.015 + Math.random() * 0.02,
        hue: HUES[Math.floor(Math.random() * HUES.length)],
        alpha: 0.75 + Math.random() * 0.25,
      });
    }

    function burst(x, y, hue) {
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
        const speed = 1.5 + Math.random() * 2.5;
        particles.push({
          x, y, hue,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          size: 2 + Math.random() * 3,
        });
      }
    }

    // 连击提示文字
    function floatText(x, y, text) {
      const el = document.createElement('div');
      el.className = 'combo-pop';
      el.textContent = text;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      stage.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      bubbles.forEach(b => {
        const grad = ctx.createRadialGradient(
          b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.1,
          b.x, b.y, b.r
        );
        grad.addColorStop(0, `hsla(${b.hue}, 90%, 88%, ${b.alpha})`);
        grad.addColorStop(0.7, `hsla(${b.hue}, 78%, 72%, ${b.alpha * 0.75})`);
        grad.addColorStop(1, `hsla(${b.hue}, 70%, 62%, ${b.alpha * 0.45})`);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = `hsla(${b.hue}, 80%, 70%, 0.5)`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // 高光
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.32, b.y - b.r * 0.34, b.r * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fill();
      });

      particles.forEach(p => {
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${p.hue}, 85%, 68%)`;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    function update() {
      const now = performance.now();

      // 生成新泡泡
      if (now - lastSpawn > 340) {
        spawn();
        lastSpawn = now;
      }

      bubbles.forEach(b => {
        b.wobble += b.wobbleSpeed;
        b.y += b.vy;
        b.x += Math.sin(b.wobble) * 0.6;
      });
      // 移出画面顶部的泡泡
      bubbles = bubbles.filter(b => b.y + b.r > -20);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;      // 轻微重力
        p.vx *= 0.98;
        p.life -= 0.022;
      });
      particles = particles.filter(p => p.life > 0);

      // 超过 1.2 秒没点破就重置连击
      if (now - lastPopAt > 1200) combo = 1;
    }

    function loop() {
      if (!running) return;
      update();
      draw();
      rafId = requestAnimationFrame(loop);
    }

    function pick(x, y) {
      // 从上层（后绘制的）往前找，命中第一个包含坐标的泡泡
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        if (Math.hypot(x - b.x, y - b.y) <= b.r) {
          const now = performance.now();
          combo = now - lastPopAt <= 1200 ? Math.min(combo + 1, 5) : 1;
          lastPopAt = now;

          const gain = Math.round(b.r / 3) * combo;
          score += gain;
          scoreEl.textContent = score;
          burst(b.x, b.y, b.hue);
          floatText(b.x, b.y, `+${gain}${combo > 1 ? ` ×${combo}` : ''}`);
          bubbles.splice(i, 1);
          return;
        }
      }
    }

    function onPointer(e) {
      if (!running) return;
      const rect = canvas.getBoundingClientRect();
      pick(e.clientX - rect.left, e.clientY - rect.top);
    }

    function start() {
      resize();
      bubbles = [];
      particles = [];
      score = 0;
      timeLeft = DURATION;
      combo = 1;
      lastPopAt = 0;
      scoreEl.textContent = '0';
      timeEl.textContent = DURATION;
      overlay.classList.add('hidden');
      running = true;
      lastSpawn = 0;
      cancelAnimationFrame(rafId);
      loop();

      clearInterval(secondTimer);
      secondTimer = setInterval(() => {
        timeLeft -= 1;
        timeEl.textContent = Math.max(timeLeft, 0);
        if (timeLeft <= 0) end();
      }, 1000);
    }

    function end() {
      running = false;
      clearInterval(secondTimer);
      cancelAnimationFrame(rafId);
      draw();

      const best = Number(localStorage.getItem(BEST_KEY) || 0);
      const isBest = score > best;
      if (isBest) {
        localStorage.setItem(BEST_KEY, String(score));
        bestEl.textContent = score;
      }

      overlayTitle.textContent = isBest ? '🎉 新纪录！' : '时间到～';
      overlayText.innerHTML = `本局得分 <span class="big-score">${score}</span>${
        isBest ? '<br>刷新了你的最高分！' : `<br>最高分 ${Math.max(best, score)}，再来一局试试？`
      }`;
      startBtn.textContent = '🔁 再来一局';
      overlay.classList.remove('hidden');
      if (isBest) {
        window.toast(`新纪录：${score} 分！`, 'success');
        confetti();
      }
    }

    // 暂停（切到另一个游戏或页面隐藏时）
    function pause() {
      if (!running) return;
      running = false;
      clearInterval(secondTimer);
      cancelAnimationFrame(rafId);
      overlayTitle.textContent = '已暂停';
      overlayText.textContent = '休息一下也可以，随时继续。';
      startBtn.textContent = '▶ 继续游戏';
      overlay.classList.remove('hidden');
    }

    startBtn.addEventListener('click', start);
    canvas.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', () => { if (!document.getElementById('bubble-panel').classList.contains('active')) return; resize(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

    resize();

    return { pause, isRunning: () => running };
  })();

  /* ---------- 彩带效果 ---------- */
  function confetti() {
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    const emojis = ['🎉', '💜', '✨', '🫧', '🌟'];
    for (let i = 0; i < 28; i++) {
      const span = document.createElement('span');
      span.className = 'confetti';
      span.textContent = emojis[i % emojis.length];
      span.style.left = Math.random() * 100 + 'vw';
      span.style.fontSize = (0.9 + Math.random() * 1.1) + 'rem';
      span.style.animationDuration = (2.4 + Math.random() * 1.8) + 's';
      span.style.animationDelay = Math.random() * 0.6 + 's';
      layer.appendChild(span);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 5200);
  }

  /* ==================================================
     三、情绪记忆翻牌
     ================================================== */
  (function memoryGame() {
    const EMOJIS = ['😄', '🙂', '😌', '😰', '😢', '🥰'];
    const BEST_KEY = 'sunny-lab-memory-best';

    const grid = document.getElementById('memory-grid');
    const movesEl = document.getElementById('memory-moves');
    const timeEl = document.getElementById('memory-time');
    const bestEl = document.getElementById('memory-best');
    const restartBtn = document.getElementById('memory-restart');

    let firstCard = null;
    let lock = false;
    let moves = 0;
    let matched = 0;
    let startedAt = null;
    let timerId = null;

    function showBest() {
      const best = localStorage.getItem(BEST_KEY);
      bestEl.textContent = best ? `${JSON.parse(best).moves} 步` : '—';
    }

    function shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    function tick() {
      if (startedAt) timeEl.textContent = formatTime(Date.now() - startedAt);
    }

    function reset() {
      clearInterval(timerId);
      firstCard = null;
      lock = false;
      moves = 0;
      matched = 0;
      startedAt = null;
      movesEl.textContent = '0';
      timeEl.textContent = '0:00';

      const deck = shuffle([...EMOJIS, ...EMOJIS]);
      grid.innerHTML = '';
      deck.forEach(emoji => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'memory-card';
        card.dataset.emoji = emoji;
        card.setAttribute('aria-label', '情绪卡片');
        card.innerHTML = `
          <div class="memory-inner">
            <div class="memory-face memory-back">💜</div>
            <div class="memory-face memory-front">${emoji}</div>
          </div>
        `;
        card.addEventListener('click', () => flip(card));
        grid.appendChild(card);
      });
      showBest();
    }

    function flip(card) {
      if (lock || card.classList.contains('flipped') || card.classList.contains('matched')) return;

      if (!startedAt) {
        startedAt = Date.now();
        timerId = setInterval(tick, 200);
      }

      card.classList.add('flipped');

      if (!firstCard) {
        firstCard = card;
        return;
      }

      moves += 1;
      movesEl.textContent = moves;
      const second = card;

      if (firstCard.dataset.emoji === second.dataset.emoji) {
        firstCard.classList.add('matched');
        second.classList.add('matched');
        firstCard = null;
        matched += 1;
        if (matched === EMOJIS.length) win();
      } else {
        lock = true;
        firstCard.classList.add('wrong');
        second.classList.add('wrong');
        const a = firstCard, b = second;
        firstCard = null;
        setTimeout(() => {
          a.classList.remove('flipped', 'wrong');
          b.classList.remove('flipped', 'wrong');
          lock = false;
        }, 720);
      }
    }

    function win() {
      clearInterval(timerId);
      const elapsed = Date.now() - startedAt;
      timeEl.textContent = formatTime(elapsed);

      const best = localStorage.getItem(BEST_KEY);
      const record = { moves, ms: elapsed };
      const isBest = !best || moves < JSON.parse(best).moves;
      if (isBest) localStorage.setItem(BEST_KEY, JSON.stringify(record));
      showBest();

      confetti();
      window.toast(
        isBest
          ? `🎉 新纪录！${moves} 步、用时 ${formatTime(elapsed)}`
          : `完成！${moves} 步、用时 ${formatTime(elapsed)}`,
        'success',
        4000
      );
    }

    restartBtn.addEventListener('click', () => {
      reset();
      window.toast('已重新开局', 'info', 1500);
    });

    reset();
  })();
})();
