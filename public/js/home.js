/* 首页：图表渲染 + 数字滚动
 *
 * 图表在滚动到视口时才创建，动画因此在下滑到该图的那一刻才开始播，
 * 不会在屏幕外白白播完。主题切换时只重绘已经画过的图。
 *
 * 数据来源（均为中国科学院心理研究所「心理健康蓝皮书」公开数据）：
 * [1] 总报告《中国国民心理健康发展报告（2021～2022）》，成年人样本 6859 份，覆盖 31 省
 *     · 18–24 岁组抑郁风险检出率 24.1%，25–34 岁组 12.3%，全样本 10.6%
 * [2] 分报告《2022年大学生心理健康状况调查报告》，31 省近 8 万名 15–26 岁大学生
 *     · 焦虑风险检出率 45.28%，抑郁风险检出率 21.48%
 * [3] 分报告《2020年大学生心理健康现状与需求》，8446 名大学生，平均年龄 20.1 岁
 *     · 情绪调节含人际支持、认知重评、转移注意三种方式，60.8% 至少掌握其中一种
 *       （即 39.2% 三种一种都没有）；转移注意最常用，人际支持最有效
 *     · 心理健康意识较强 57%；使用过校内心理咨询 21.4%
 * 以上为报告公开摘要中的数值，各年样本与口径不同，用于了解整体趋势。
 */

(function () {
  'use strict';

  const charts = {};          // canvas id → Chart 实例
  const revealed = new Set(); // 已经滚动到过的图表，主题切换时只重绘这些

  // 数据系列配色
  function palette() {
    return {
      age: ['#9333ea', '#c084fc', '#e9d5ff'],       // 不同年龄段
      anxiety: ['#a855f7', '#e9d5ff'],              // 有/无焦虑风险
      regulation: ['#a855f7', '#e9d5ff'],           // 掌握 / 未掌握情绪调节方式
    };
  }

  function baseScales() {
    const { text, grid } = window.chartColors();
    return {
      y: { beginAtZero: true, grid: { color: grid }, ticks: { color: text } },
      x: { grid: { display: false }, ticks: { color: text } },
    };
  }

  // 每张图一个构造函数，方便按需单独触发
  const BUILDERS = {
    // 柱状图：不同年龄段的抑郁风险检出率
    ageRiskChart(el, P) {
      const s = baseScales();
      s.y.suggestedMax = 28;
      s.y.ticks.callback = v => v + '%';
      return new Chart(el, {
        type: 'bar',
        data: {
          labels: ['18–24 岁', '25–34 岁', '全国成年总体'],
          datasets: [{
            label: '抑郁风险检出率',
            data: [24.1, 12.3, 10.6],
            backgroundColor: P.age,
            borderRadius: 8,
            maxBarThickness: 72,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 900, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: c => ` 抑郁风险检出率 ${c.parsed.y}%` } },
          },
          scales: s,
        },
      });
    },

    // 环形图：大学生焦虑风险检出率
    anxietyChart(el, P, text) {
      return new Chart(el, {
        type: 'doughnut',
        data: {
          labels: ['存在焦虑风险', '无焦虑风险'],
          datasets: [{
            data: [45.28, 54.72],
            backgroundColor: P.anxiety,
            borderColor: 'rgba(255,255,255,0.7)',
            borderWidth: 2,
            hoverOffset: 10,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '58%',
          animation: { animateRotate: true, duration: 1000 },
          plugins: {
            legend: { position: 'bottom', labels: { color: text } },
            tooltip: { callbacks: { label: c => ` ${c.label} ${c.parsed}%` } },
          },
        },
      });
    },

    // 百分比堆叠条：大学生掌握情绪调节方式的情况
    // 横向堆叠成一条满 100% 的带子，直接读作「六成 / 四成」的比例
    regulationChart(el, P, text, grid) {
      const s = baseScales();
      s.x.beginAtZero = true;
      s.x.stacked = true;
      s.x.max = 100;
      s.x.grid = { display: true, color: grid };
      s.x.ticks.callback = v => v + '%';
      s.y.stacked = true;   // 值轴与分类轴都要声明，堆叠才生效
      s.y.display = false;
      return new Chart(el, {
        type: 'bar',
        data: {
          labels: ['大学生'],
          datasets: [
            {
              label: '至少掌握一种',
              data: [60.8],
              backgroundColor: P.regulation[0],
              borderRadius: 4,
              maxBarThickness: 88,
            },
            {
              label: '三种一种都没有',
              data: [39.2],
              backgroundColor: P.regulation[1],
              borderRadius: 4,
              maxBarThickness: 88,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 900, easing: 'easeOutQuart' },
          plugins: {
            legend: { position: 'bottom', labels: { color: text, boxWidth: 12 } },
            tooltip: { callbacks: { label: c => ` ${c.dataset.label} ${c.parsed.x}%` } },
          },
          scales: s,
        },
      });
    },
  };

  function renderChart(id) {
    const el = document.getElementById(id);
    if (!el || !BUILDERS[id]) return;
    if (charts[id]) charts[id].destroy();
    const { text, grid } = window.chartColors();
    charts[id] = BUILDERS[id](el, palette(), text, grid);
  }

  // 主题切换 → 重绘已经画过的图以匹配配色；还没滚动到的不画
  function renderRevealedCharts() {
    revealed.forEach(id => renderChart(id));
  }

  // 图表进入视口时才创建，动画这一刻才开始
  function initChartReveal() {
    const ids = Object.keys(BUILDERS).filter(id => document.getElementById(id));
    const revealAll = () => ids.forEach(id => { revealed.add(id); renderChart(id); });

    // 兜底：不支持 IntersectionObserver 时直接全部画出
    if (typeof IntersectionObserver === 'undefined') return revealAll();

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        revealed.add(entry.target.id);
        renderChart(entry.target.id);
        obs.unobserve(entry.target);   // 只播一次，来回滚动不重播
      });
    }, { threshold: 0.25, rootMargin: '0px 0px -8% 0px' });

    ids.forEach(id => io.observe(document.getElementById(id)));
  }

  // 数字滚动（进入视口时触发一次）
  function initStatNumbers() {
    const nums = document.querySelectorAll('.stat-num');
    // 兜底：不支持 IntersectionObserver 时直接显示最终数值
    if (typeof IntersectionObserver === 'undefined') {
      nums.forEach(n => { n.textContent = Number(n.dataset.target).toFixed(Number(n.dataset.decimals) || 0); });
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          window.countUp(el, Number(el.dataset.target), 1400, '', Number(el.dataset.decimals) || 0);
          io.unobserve(el);
        }
      });
    }, { threshold: 0.6 });
    nums.forEach(n => io.observe(n));
  }

  document.addEventListener('DOMContentLoaded', () => {
    initChartReveal();
    initStatNumbers();
  });

  document.addEventListener('themechange', renderRevealedCharts);
})();
