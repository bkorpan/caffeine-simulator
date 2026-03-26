// Chart wrapper using uPlot

let chartInstance = null;

function doseMarkersPlugin(getDoses) {
  return {
    hooks: {
      draw: [
        (u) => {
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

const SERIES_META = [
  { label: 'Caffeine', color: '--color-caffeine', dashed: false },
  { label: 'Paraxanthine', color: '--color-paraxanthine', dashed: false },
  { label: 'Effective (A1R)', color: '--color-effective', dashed: true },
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

function formatHourLabels(self, ticks) {
  return ticks.map(v => {
    const h = Math.floor(v / 60) % 24;
    return String(h).padStart(2, '0');
  });
}

function initChart(container, getDoses) {
  const opts = {
    width: container.clientWidth,
    height: 350,
    padding: [20, 10, 0, 0],
    scales: {
      x: { time: false },
      y: {
        auto: true,
        range: (u, min, max) => [0, Math.max(max * 1.1, 0.5)],
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
        label: 'Effective (A1R)',
        stroke: getComputedStyle(document.documentElement).getPropertyValue('--color-effective').trim() || '#ef4444',
        width: 2,
        dash: [6, 4],
      },
    ],
    legend: { show: false },
    cursor: {
      drag: { x: true, y: false, setScale: true },
    },
    plugins: [doseMarkersPlugin(getDoses), legendPlugin()],
  };

  const data = [
    new Float64Array(0),
    new Float64Array(0),
    new Float64Array(0),
    new Float64Array(0),
  ];

  chartInstance = new uPlot(opts, data, container);

  const ro = new ResizeObserver(entries => {
    const width = entries[0].contentRect.width;
    if (Math.abs(width - chartInstance.width) > 1) {
      chartInstance.setSize({ width, height: 350 });
    }
  });
  ro.observe(container);

  return chartInstance;
}

function updateChartData(results) {
  if (!chartInstance) return;

  const data = [
    results.timestamps,
    results.caffeine,
    results.paraxanthine,
    results.effective,
  ];

  chartInstance.setData(data);
}
