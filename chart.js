// Chart wrapper using uPlot — supports multiple instances

let sharedYMax = 0.5; // Global y-max across all scenarios

function setSharedYMax(max) {
  sharedYMax = max;
}

function doseMarkersPlugin(getDoses) {
  return {
    hooks: {
      draw: [
        (u) => {
          if (document.body.classList.contains('embed')) return;
          const doses = getDoses();
          if (!doses.length) return;
          const ctx = u.ctx;
          const { left, top, width, height } = u.bbox;
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#94a3b8';
          ctx.font = '10px system-ui, sans-serif';
          ctx.fillStyle = '#94a3b8';
          ctx.textAlign = 'center';

          doses.forEach(d => {
            const x = u.valToPos(d.timestamp, 'x', true);
            if (x < left || x > left + width) return;
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, top + height);
            ctx.stroke();
            ctx.fillText(d.label, x, top - 4);
          });
          ctx.restore();
        }
      ]
    }
  };
}

function dayBandsPlugin() {
  return {
    hooks: {
      drawAxes: [
        (u) => {
          const ctx = u.ctx;
          const { left, top, width, height } = u.bbox;
          const [xMin, xMax] = [u.scales.x.min, u.scales.x.max];

          const firstDay = Math.floor(xMin / 1440);
          const lastDay = Math.ceil(xMax / 1440);

          ctx.save();
          for (let day = firstDay; day <= lastDay; day++) {
            if (day % 2 === 0) continue;
            const startMin = day * 1440;
            const endMin = (day + 1) * 1440;
            const x0 = Math.max(u.valToPos(startMin, 'x', true), left);
            const x1 = Math.min(u.valToPos(endMin, 'x', true), left + width);
            if (x1 <= x0) continue;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
            ctx.fillRect(x0, top, x1 - x0, height);
          }
          ctx.restore();
        }
      ]
    }
  };
}

const SERIES_META = [
  { label: 'Caffeine', color: '--color-caffeine', dashed: false },
  { label: 'Paraxanthine', color: '--color-paraxanthine', dashed: false },
  { label: 'Effective', color: '--color-effective', dashed: true },
];

function legendPlugin() {
  return {
    hooks: {
      init: [
        (u) => {
          const el = document.createElement('div');
          el.className = 'chart-legend';
          const styles = getComputedStyle(document.documentElement);
          for (const meta of SERIES_META) {
            const item = document.createElement('span');
            item.className = 'chart-legend-item';

            const line = document.createElement('span');
            line.className = 'chart-legend-line';
            if (meta.dashed) {
              line.classList.add('chart-legend-line-dashed');
            }
            line.style.setProperty('border-top-color', styles.getPropertyValue(meta.color).trim());

            const label = document.createElement('span');
            label.textContent = meta.label;

            item.appendChild(line);
            item.appendChild(label);
            el.appendChild(item);
          }
          u.root.appendChild(el);
        }
      ]
    }
  };
}

function tooltipPlugin() {
  let tooltip;

  function init(u) {
    tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    tooltip.style.display = 'none';
    u.root.querySelector('.u-over').appendChild(tooltip);
  }

  function setCursor(u) {
    const idx = u.cursor.idx;
    if (idx == null || !u.data[0].length) {
      tooltip.style.display = 'none';
      return;
    }

    const min = u.data[0][idx];
    const h = Math.floor(min / 60) % 24;
    const m = Math.round(min % 60);
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    let rows = `<div class="chart-tooltip-time">${time}</div>`;
    for (let i = 1; i < u.series.length; i++) {
      const s = u.series[i];
      if (!s.show) continue;
      const val = u.data[i][idx];
      if (val == null) continue;
      const color = SERIES_META[i - 1].dashed ? 'var(--color-effective)' : s._stroke;
      rows += `<div class="chart-tooltip-row"><span class="chart-tooltip-dot" style="background:${color}"></span>${s.label}: ${val.toFixed(2)} mg/L</div>`;
    }
    tooltip.innerHTML = rows;
    tooltip.style.display = 'block';

    const left = u.valToPos(min, 'x');
    const overWidth = u.root.querySelector('.u-over').offsetWidth;
    const tipWidth = tooltip.offsetWidth;
    tooltip.style.left = (left + tipWidth + 24 > overWidth ? left - tipWidth - 24 : left + 24) + 'px';
    tooltip.style.top = '10px';
  }

  return {
    hooks: {
      init: [init],
      setCursor: [setCursor],
    }
  };
}

function formatHourLabels(self, ticks) {
  return ticks.map(v => {
    const h = Math.floor(v / 60) % 24;
    return String(h).padStart(2, '0');
  });
}

function createChart(container, getDoses, showLegend) {
  const opts = {
    width: container.clientWidth,
    height: 350,
    padding: [20, 10, 0, 0],
    scales: {
      x: { time: false },
      y: {
        auto: true,
        range: (u, min, max) => {
          if (document.body.classList.contains('embed')) return [0, 2.5];
          const padded = sharedYMax * 1.1;
          const step = padded <= 1 ? 0.25 : padded <= 3 ? 0.5 : 1;
          return [0, Math.max(Math.ceil(padded / step) * step, 0.5)];
        },
      },
    },
    axes: [
      {
        label: 'Time',
        values: formatHourLabels,
        splits: (u) => {
          const [min, max] = u.scales.x.range(u, u.data[0][0], u.data[0][u.data[0].length - 1]);
          const ticks = [];
          const start = Math.ceil(min / 60) * 60;
          for (let m = start; m <= max; m += 120) {
            ticks.push(m);
          }
          return ticks;
        },
        size: 40,
      },
      {
        label: 'Concentration (mg/L)',
        size: 55,
        values: (u, ticks) => ticks.map(v => v.toFixed(1)),
      },
    ],
    series: [
      { label: 'Time' },
      {
        label: 'Caffeine',
        stroke: getComputedStyle(document.documentElement).getPropertyValue('--color-caffeine').trim() || '#2563eb',
        width: 2,
      },
      {
        label: 'Paraxanthine',
        stroke: getComputedStyle(document.documentElement).getPropertyValue('--color-paraxanthine').trim() || '#f59e0b',
        width: 2,
      },
      {
        label: 'Effective',
        stroke: getComputedStyle(document.documentElement).getPropertyValue('--color-effective').trim() || '#ef4444',
        width: 2,
        dash: [6, 4],
      },
    ],
    legend: { show: false },
    cursor: {
      drag: { x: true, y: false, setScale: true },
    },
    plugins: [
      dayBandsPlugin(),
      doseMarkersPlugin(getDoses),
      tooltipPlugin(),
      ...(showLegend !== false ? [legendPlugin()] : []),
    ],
  };

  const data = [
    new Float64Array(0),
    new Float64Array(0),
    new Float64Array(0),
    new Float64Array(0),
  ];

  const chart = new uPlot(opts, data, container);

  const ro = new ResizeObserver(entries => {
    const width = entries[0].contentRect.width;
    if (Math.abs(width - chart.width) > 1) {
      chart.setSize({ width, height: 350 });
    }
  });
  ro.observe(container);

  return chart;
}

function updateChartData(chart, results) {
  if (!chart) return;
  chart.setData([
    results.timestamps,
    results.caffeine,
    results.paraxanthine,
    results.effective,
  ]);
}
