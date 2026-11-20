import { formatCurrency, formatPercent } from "./format.js";

export const CHART_COLORS = Object.freeze([
  "#0f766e",
  "#c2410c",
  "#2563eb",
  "#a16207",
  "#be123c",
  "#4d7c0f",
  "#7c3aed",
  "#475569"
]);

function cssColor(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function chartTheme() {
  return {
    ink: cssColor("--color-ink", "#182321"),
    muted: cssColor("--color-ink-muted", "#5b6a66"),
    grid: cssColor("--color-border", "#ced9d5"),
    surface: cssColor("--color-surface", "#ffffff"),
    primary: cssColor("--color-primary", "#0f766e"),
    surfaceMuted: cssColor("--color-surface-muted", "#eaf0ee")
  };
}

function setFont(ctx, size, weight = 500) {
  ctx.font = `${weight} ${size}px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
}

function fitText(ctx, value, maxWidth) {
  const text = String(value);
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function createRenderer(canvas, draw) {
  let frame = 0;
  let destroyed = false;
  const colorScheme = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
  const observer =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => schedule())
      : null;

  function render() {
    frame = 0;
    if (destroyed || !canvas.isConnected) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, { width, height, theme: chartTheme() });
  }

  function schedule() {
    if (destroyed || frame) {
      return;
    }
    frame = globalThis.requestAnimationFrame(render);
  }

  function handleVisibility() {
    if (document.visibilityState === "visible") {
      schedule();
    }
  }

  observer?.observe(canvas.parentElement ?? canvas);
  globalThis.addEventListener("resize", schedule);
  document.addEventListener("visibilitychange", handleVisibility);
  colorScheme?.addEventListener?.("change", schedule);
  schedule();

  return {
    redraw: schedule,
    destroy() {
      destroyed = true;
      if (frame) {
        globalThis.cancelAnimationFrame(frame);
      }
      observer?.disconnect();
      globalThis.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", handleVisibility);
      colorScheme?.removeEventListener?.("change", schedule);
    }
  };
}

export function drawBarChart(ctx, { width, height, data, theme }) {
  if (!data.length) {
    return;
  }

  const labelWidth = Math.min(94, width * 0.3);
  const valueWidth = Math.min(100, width * 0.3);
  const trackX = labelWidth + 10;
  const trackWidth = Math.max(20, width - trackX - valueWidth - 8);
  const maxValue = Math.max(...data.map((item) => item.value), 1);
  const rowHeight = Math.min(40, (height - 12) / data.length);

  data.forEach((item, index) => {
    const centerY = 8 + rowHeight * index + rowHeight / 2;
    const barHeight = Math.max(12, Math.min(22, rowHeight - 10));
    const barY = centerY - barHeight / 2;
    const barWidth = Math.max(0, (item.value / maxValue) * trackWidth);

    setFont(ctx, 11, 650);
    ctx.fillStyle = theme.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(fitText(ctx, item.label, labelWidth), 0, centerY);

    ctx.fillStyle = theme.surfaceMuted;
    ctx.fillRect(trackX, barY, trackWidth, barHeight);
    ctx.fillStyle = item.color ?? CHART_COLORS[index % CHART_COLORS.length];
    ctx.fillRect(trackX, barY, barWidth, barHeight);

    setFont(ctx, 11, 650);
    ctx.fillStyle = theme.ink;
    ctx.textAlign = "right";
    ctx.fillText(formatCurrency(item.value), width - 1, centerY);
  });
}

export function drawPieChart(ctx, { width, height, data, theme }) {
  if (!data.length) {
    return;
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    return;
  }

  const radius = Math.min(86, height * 0.36, width * 0.25);
  const centerX = radius + 12;
  const centerY = height / 2;
  let angle = -Math.PI / 2;

  data.forEach((item, index) => {
    const slice = (item.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = item.color ?? CHART_COLORS[index % CHART_COLORS.length];
    ctx.fill();
    ctx.strokeStyle = theme.surface;
    ctx.lineWidth = 2;
    ctx.stroke();
    angle += slice;
  });

  const legendX = centerX + radius + 22;
  const rowHeight = Math.min(36, (height - 16) / data.length);
  data.forEach((item, index) => {
    const y = height / 2 - (data.length * rowHeight) / 2 + index * rowHeight + rowHeight / 2;
    const color = item.color ?? CHART_COLORS[index % CHART_COLORS.length];
    ctx.fillStyle = color;
    ctx.fillRect(legendX, y - 5, 10, 10);
    setFont(ctx, 11, 650);
    ctx.fillStyle = theme.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(fitText(ctx, item.label, Math.max(48, width - legendX - 66)), legendX + 16, y);
    setFont(ctx, 10, 500);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = "right";
    ctx.fillText(formatPercent(item.value / total), width - 2, y);
  });
}

function niceStep(value) {
  if (value <= 0) {
    return 1;
  }
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
}

export function drawLineChart(ctx, { width, height, data, theme }) {
  if (!data.length) {
    return;
  }

  const margin = { top: 20, right: 14, bottom: 30, left: 66 };
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = Math.max(1, height - margin.top - margin.bottom);
  const maxRaw = Math.max(...data.map((item) => item.value), 1);
  const step = niceStep(maxRaw / 4);
  const maxValue = step * 4;

  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = theme.muted;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  setFont(ctx, 9, 500);

  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const y = margin.top + plotHeight - ratio * plotHeight;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(width - margin.right, y);
    ctx.stroke();
    ctx.fillText(formatCurrency(step * index), margin.left - 8, y);
  }

  const xAt = (index) => {
    if (data.length === 1) {
      return margin.left + plotWidth / 2;
    }
    return margin.left + (index / (data.length - 1)) * plotWidth;
  };
  const yAt = (value) => margin.top + plotHeight - (value / maxValue) * plotHeight;
  const points = data.map((item, index) => ({
    x: xAt(index),
    y: yAt(item.value)
  }));

  ctx.beginPath();
  ctx.moveTo(points[0].x, margin.top + plotHeight);
  for (const point of points) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.lineTo(points.at(-1).x, margin.top + plotHeight);
  ctx.closePath();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = theme.primary;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const pointRadius = data.length > 8 ? 2.6 : 3.4;
  for (const point of points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
    ctx.fillStyle = theme.primary;
    ctx.fill();
    ctx.strokeStyle = theme.surface;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const labelInterval = Math.max(1, Math.ceil(data.length / 6));
  ctx.fillStyle = theme.muted;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  setFont(ctx, 9, 500);
  data.forEach((item, index) => {
    if (index % labelInterval === 0 || index === data.length - 1) {
      ctx.fillText(item.label, points[index].x, margin.top + plotHeight + 8);
    }
  });
}

export function mountBarChart(canvas, data) {
  return createRenderer(canvas, (ctx, context) => {
    drawBarChart(ctx, { ...context, data });
  });
}

export function mountPieChart(canvas, data) {
  return createRenderer(canvas, (ctx, context) => {
    drawPieChart(ctx, { ...context, data });
  });
}

export function mountLineChart(canvas, data) {
  return createRenderer(canvas, (ctx, context) => {
    drawLineChart(ctx, { ...context, data });
  });
}
