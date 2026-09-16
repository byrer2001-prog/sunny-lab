/* ============================================================
   心晴实验室 · 公共脚本
   主题切换 / Toast 通知 / 导航 / 滚动动画 / API 封装
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 主题（深色模式，localStorage 持久化） ---------- */
  const THEME_KEY = 'sunny-lab-theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.textContent = theme === 'dark' ? '☀️' : '🌙';
      btn.title = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
    });
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  }

  window.toggleTheme = function () {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    // 主题变化后通知图表重绘
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
  };

  initTheme();

  /* ---------- 渐变光斑背景（需等 body 就绪） ---------- */
  function initBlobs() {
    const blobs = document.createElement('div');
    blobs.className = 'bg-blobs';
    blobs.innerHTML = '<div class="blob-3"></div>';
    document.body.prepend(blobs);
  }

  /* ---------- Toast ---------- */
  let toastContainer = null;

  function ensureToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  /**
   * 显示一条轻提示
   * @param {string} message
   * @param {'success'|'error'|'info'} type
   * @param {number} duration 毫秒
   */
  window.toast = function (message, type = 'info', duration = 2600) {
    const icons = { success: '✅', error: '⚠️', info: '💜' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span>${icons[type] || icons.info}</span><span></span>`;
    el.lastElementChild.textContent = message; // 防注入
    ensureToastContainer().appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);
  };

  /* ---------- 移动端导航 ---------- */
  window.toggleNav = function () {
    document.querySelector('.nav-links')?.classList.toggle('open');
  };

  /* ---------- 滚动进场动画 ---------- */
  function initReveal() {
    const targets = document.querySelectorAll('.reveal');
    if (!targets.length) return;
    // 兜底：不支持 IntersectionObserver 时直接显示，避免内容永远隐藏
    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach(t => t.classList.add('visible'));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    targets.forEach(t => io.observe(t));
  }

  /* ---------- 回到顶部 ---------- */
  function initBackToTop() {
    const btn = document.createElement('button');
    btn.className = 'back-to-top';
    btn.textContent = '↑';
    btn.title = '回到顶部';
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.body.appendChild(btn);
    window.addEventListener('scroll', () => {
      btn.classList.toggle('show', window.scrollY > 400);
    }, { passive: true });
  }

  /* ---------- 数字滚动动画 ---------- */
  /**
   * @param {HTMLElement} el 目标元素，文本为最终数字
   * @param {number} duration 毫秒
   */
  // decimals > 0 时保留小数（用于 45.28 这类真实统计值）
  window.countUp = function (el, target, duration = 1400, suffix = '', decimals = 0) {
    const start = performance.now();
    const format = v => (decimals > 0 ? v.toFixed(decimals) : String(Math.round(v)));
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el.textContent = format(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };

  /* ---------- API 封装 ---------- */
  window.api = {
    async request(url, options = {}) {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.msg || `请求失败（${res.status}）`);
      return body;
    },
    get: (url) => window.api.request(url),
    post: (url, data) => window.api.request(url, { method: 'POST', body: JSON.stringify(data) }),
    put: (url, data) => window.api.request(url, { method: 'PUT', body: JSON.stringify(data) }),
    del: (url) => window.api.request(url, { method: 'DELETE' }),
  };

  /* ---------- HTML 转义（防 XSS） ---------- */
  window.escapeHtml = function (str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
  };

  /* ---------- 主题相关的图表配色 ---------- */
  window.chartColors = function () {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      text: dark ? '#d8b4fe' : '#6b21a8',
      grid: dark ? 'rgba(216,180,254,0.12)' : 'rgba(147,51,234,0.08)',
    };
  };

  document.addEventListener('DOMContentLoaded', () => {
    // head 中执行时按钮尚未渲染，DOM 就绪后刷新一次主题图标
    applyTheme(document.documentElement.getAttribute('data-theme'));
    initBlobs();
    initReveal();
    initBackToTop();
  });
})();
