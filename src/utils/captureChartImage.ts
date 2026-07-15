/** Capture a Recharts (SVG) chart as a PNG blob for copy / download / share. */

function cssColor(value: string, fallback: string): string {
  const v = value.trim();
  if (!v || v === 'none' || v.startsWith('url(') || v.includes('var(')) return fallback;
  return v;
}

function inlineSvgComputedStyles(source: SVGSVGElement, clone: SVGSVGElement): void {
  const srcNodes = [source, ...Array.from(source.querySelectorAll<SVGElement>('*'))];
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll<SVGElement>('*'))];

  for (let i = 0; i < srcNodes.length; i++) {
    const src = srcNodes[i];
    const dest = cloneNodes[i];
    if (!src || !dest) continue;
    const cs = getComputedStyle(src);

    const fill = cssColor(cs.fill, '');
    if (fill) dest.setAttribute('fill', fill);
    const stroke = cssColor(cs.stroke, '');
    if (stroke) dest.setAttribute('stroke', stroke);

    if (cs.strokeWidth) dest.setAttribute('stroke-width', cs.strokeWidth);
    if (cs.opacity && cs.opacity !== '1') dest.setAttribute('opacity', cs.opacity);
    if (cs.fontSize) dest.setAttribute('font-size', cs.fontSize);
    if (cs.fontFamily) dest.setAttribute('font-family', cs.fontFamily);
    if (cs.fontWeight) dest.setAttribute('font-weight', cs.fontWeight);
    if (cs.textAnchor) dest.setAttribute('text-anchor', cs.textAnchor);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not render chart image'));
    img.src = url;
  });
}

export interface ChartCaptureMeta {
  title: string;
  subtitle?: string;
  footer?: string;
}

export async function captureChartPngBlob(
  chartRoot: HTMLElement,
  meta: ChartCaptureMeta,
  options?: { pixelRatio?: number },
): Promise<Blob> {
  const svg =
    chartRoot.querySelector<SVGSVGElement>('.chart-mobile-inner svg') ??
    chartRoot.querySelector<SVGSVGElement>('svg');
  if (!svg) throw new Error('Chart is not ready yet');

  const inner = chartRoot.querySelector<HTMLElement>('.chart-mobile-inner');
  // Prefer the laid-out full chart width (important for sideways-scrolling session charts).
  const width = Math.max(
    1,
    Math.ceil(
      inner?.offsetWidth ||
        svg.clientWidth ||
        Number(svg.getAttribute('width')) ||
        svg.getBoundingClientRect().width ||
        640,
    ),
  );
  const height = Math.max(
    1,
    Math.ceil(
      inner?.offsetHeight ||
        svg.clientHeight ||
        Number(svg.getAttribute('height')) ||
        svg.getBoundingClientRect().height ||
        240,
    ),
  );
  const ratio = Math.min(3, Math.max(2, options?.pixelRatio ?? (window.devicePixelRatio || 2)));

  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineSvgComputedStyles(svg, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  const svgXml = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([svgXml], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const chartImg = await loadImage(svgUrl);
    const headerH = 72;
    const footerH = meta.footer ? 36 : 16;
    const padX = 20;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((width + padX * 2) * ratio);
    canvas.height = Math.round((height + headerH + footerH) * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');

    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width + padX * 2, height + headerH + footerH);

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 16px system-ui, Segoe UI, sans-serif';
    ctx.fillText(meta.title, padX, 28);

    if (meta.subtitle) {
      ctx.fillStyle = '#64748b';
      ctx.font = '600 12px system-ui, Segoe UI, sans-serif';
      ctx.fillText(meta.subtitle, padX, 48);
    }

    ctx.drawImage(chartImg, padX, headerH, width, height);

    if (meta.footer) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 11px system-ui, Segoe UI, sans-serif';
      ctx.fillText(meta.footer, padX, headerH + height + 22);
    }

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('Could not create PNG'))),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function copyImageBlob(blob: Blob): Promise<'copied' | 'shared' | 'downloaded'> {
  const file = new File([blob], 'session-wise-chart.png', { type: 'image/png' });

  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    } catch {
      // fall through — mobile Safari often blocks image clipboard write
    }
  }

  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Session-wise chart',
        text: 'My session attendance chart',
      });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
  }

  downloadBlob(blob, file.name);
  return 'downloaded';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
