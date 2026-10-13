import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import './ChartMobileFrame.css';

const DESKTOP_ZOOM = [0.85, 1, 1.2, 1.45] as const;
/** 1 = the whole chart fits the phone. Larger steps spread it out for a closer look. */
const PHONE_ZOOM = [1, 1.6, 2.4, 3.4] as const;

interface Props {
  children: ReactNode;
  chartKey: string;
  height?: number;
  needsHorizontalScroll?: boolean;
  innerWidth?: number;
  scrollRef?: RefObject<HTMLDivElement | null>;
  showScrollLadder?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export default function ChartMobileFrame({
  children,
  chartKey,
  height = 220,
  needsHorizontalScroll = false,
  innerWidth,
  scrollRef,
  showScrollLadder = false,
  onExpandedChange,
}: Props) {
  const fitToWidth = useMediaQuery('(max-width: 640px)');
  const internalRef = useRef<HTMLDivElement>(null);
  const viewportRef = scrollRef ?? internalRef;
  const zoomIndexRef = useRef(0);
  const [zoomIndex, setZoomIndex] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 0 : 1,
  );
  const [containerWidth, setContainerWidth] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const levels = fitToWidth ? PHONE_ZOOM : DESKTOP_ZOOM;
  const safeIndex = Math.min(zoomIndex, levels.length - 1);
  const zoom = levels[safeIndex];
  zoomIndexRef.current = safeIndex;

  const renderedWidth = fitToWidth
    ? (containerWidth > 0 ? Math.round(containerWidth * zoom) : undefined)
    : (innerWidth ? Math.round(innerWidth * zoom) : undefined);
  const expanded = fitToWidth
    ? zoom > 1
    : Boolean(needsHorizontalScroll && renderedWidth && containerWidth > 0 && renderedWidth > containerWidth + 8);

  const scaledHeight = Math.round(height * (fitToWidth ? Math.min(zoom, 1.35) : zoom));

  useEffect(() => {
    setZoomIndex(fitToWidth ? 0 : 1);
  }, [chartKey, fitToWidth]);

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  const updateScrollState = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    if (!expanded) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < maxLeft - 4);
  }, [expanded, viewportRef]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScrollState) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro?.disconnect();
    };
  }, [updateScrollState, viewportRef, chartKey, renderedWidth]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !fitToWidth) return;
    let startDist = 0;
    let startIndex = 0;
    let pinching = false;

    const distance = (touches: TouchList) => {
      const a = touches[0];
      const b = touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      pinching = true;
      startDist = distance(event.touches);
      startIndex = zoomIndexRef.current;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!pinching || event.touches.length !== 2 || startDist <= 0) return;
      event.preventDefault();
      const ratio = distance(event.touches) / startDist;
      const delta = ratio >= 1.15 ? 1 : ratio <= 0.87 ? -1 : 0;
      const next = Math.max(0, Math.min(PHONE_ZOOM.length - 1, startIndex + delta));
      setZoomIndex(current => (current === next ? current : next));
    };
    const endPinch = (event: TouchEvent) => {
      if (event.touches.length < 2) pinching = false;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', endPinch);
    el.addEventListener('touchcancel', endPinch);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', endPinch);
      el.removeEventListener('touchcancel', endPinch);
    };
  }, [fitToWidth, viewportRef, chartKey]);

  const scrollBy = (delta: number) => {
    viewportRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const showLadder = showScrollLadder && expanded && !fitToWidth;
  const viewportClass = expanded
    ? 'chart-mobile-viewport chart-mobile-viewport--scroll'
    : 'chart-mobile-viewport chart-mobile-viewport--fit';

  return (
    <div className="chart-mobile-frame" data-chart={chartKey}>
      <div className="chart-mobile-toolbar">
        <span className="chart-mobile-hint">
          {fitToWidth
            ? (expanded ? 'Swipe sideways to move. Pinch to resize.' : 'Full chart shown. Pinch or + to enlarge.')
            : (needsHorizontalScroll ? 'Swipe sideways or tap arrows to see more' : 'Pinch or use zoom buttons')}
        </span>
        <div className="chart-zoom-controls" role="group" aria-label="Chart zoom">
          <button
            type="button"
            className="chart-zoom-btn"
            onClick={() => setZoomIndex(i => Math.max(0, i - 1))}
            disabled={safeIndex === 0}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="chart-zoom-label">{fitToWidth ? (expanded ? `${Math.round(zoom * 100)}%` : 'Fit') : `${Math.round(zoom * 100)}%`}</span>
          <button
            type="button"
            className="chart-zoom-btn"
            onClick={() => setZoomIndex(i => Math.min(levels.length - 1, i + 1))}
            disabled={safeIndex === levels.length - 1}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {showLadder && (
        <div className="chart-scroll-ladder" role="group" aria-label="Chart horizontal navigation">
          <button
            type="button"
            className="chart-scroll-btn"
            onClick={() => scrollBy(-Math.max(140, (viewportRef.current?.clientWidth ?? 200) * 0.65))}
            disabled={!canScrollLeft}
            aria-label="Scroll chart left"
          >
            ←
          </button>
          <div className="chart-scroll-track" aria-hidden="true">
            <span className={`chart-scroll-thumb${canScrollLeft ? ' chart-scroll-thumb--active' : ''}`} />
            <span className={`chart-scroll-thumb${canScrollRight ? ' chart-scroll-thumb--active' : ''}`} />
          </div>
          <button
            type="button"
            className="chart-scroll-btn"
            onClick={() => scrollBy(Math.max(140, (viewportRef.current?.clientWidth ?? 200) * 0.65))}
            disabled={!canScrollRight}
            aria-label="Scroll chart right"
          >
            →
          </button>
        </div>
      )}

      <div
        ref={viewportRef}
        className={viewportClass}
        style={{ height: scaledHeight }}
      >
        <div
          className="chart-mobile-inner"
          style={{
            width: expanded && renderedWidth ? renderedWidth : '100%',
            minWidth: expanded ? '100%' : undefined,
            height: scaledHeight,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
