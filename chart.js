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
            // Label
            ctx.fillText(d.label, x, top - 4);
          });
          ctx.restore();
        }
      ]
    }
  };
}

function formatTimeAxis(startMinute) {
  return (self, ticks) => {
    return ticks.map(v => {
      const totalMin = v;
      const h = Math.floor(totalMin / 60) % 24;
      const m = Math.round(totalMin % 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    });
  };
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
        values: formatTimeAxis(0),
        gap: 5,
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
        show: true,
      },
      {
        label: 'Paraxanthine',
        stroke: getComputedStyle(document.documentElement).getPropertyValue('--color-paraxanthine').trim() || '#f59e0b',
        width: 2,
        show: true,
      },
      {
        label: 'Theobromine',
        stroke: getComputedStyle(document.documentElement).getPropertyValue('--color-theobromine').trim() || '#10b981',
        width: 2,
        show: false,
      },
      {
        label: 'Theophylline',
        stroke: getComputedStyle(document.documentElement).getPropertyValue('--color-theophylline').trim() || '#8b5cf6',
        width: 2,
        show: false,
      },
      {
        label: 'Effective (A1R)',
        stroke: getComputedStyle(document.documentElement).getPropertyValue('--color-effective').trim() || '#ef4444',
        width: 2,
        dash: [6, 4],
        show: false,
      },
    ],
    cursor: {
      drag: { x: true, y: false, setScale: true },
    },
    plugins: [doseMarkersPlugin(getDoses)],
  };

  // Empty initial data
  const data = [
    new Float64Array(0),
    new Float64Array(0),
    new Float64Array(0),
    new Float64Array(0),
    new Float64Array(0),
    new Float64Array(0),
  ];

  chartInstance = new uPlot(opts, data, container);

  // Responsive resize
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
    results.theobromine,
    results.theophylline,
    results.effective,
  ];

  chartInstance.setData(data);
}

function setSeriesVisibility(seriesIdx, visible) {
  if (!chartInstance) return;
  chartInstance.setSeries(seriesIdx, { show: visible });
}
