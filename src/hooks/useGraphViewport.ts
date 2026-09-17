import { useState, useRef, useCallback, useEffect } from 'react';
import type { LayoutNode } from '../utils/graphLayout';

export interface GraphBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  graphWidth: number;
  graphHeight: number;
  cx: number;
  cy: number;
}

export interface UseGraphViewportOptions {
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
  targetMaxZoom?: number;
  targetOccupancy?: number;
}

/**
 * Accurately calculates bounding box of all nodes, or an optional subset of node IDs.
 */
export function calculateGraphBounds(
  layoutNodes: Map<string, LayoutNode>,
  subsetIds?: string[] | Set<string> | null
) {
  if (!layoutNodes || layoutNodes.size === 0) {
    return {
      minX: 0,
      maxX: 400,
      minY: 0,
      maxY: 300,
      graphWidth: 400,
      graphHeight: 300,
      cx: 200,
      cy: 150,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const idSet = subsetIds
    ? subsetIds instanceof Set
      ? subsetIds
      : new Set(subsetIds)
    : null;

  layoutNodes.forEach((node, id) => {
    if (idSet && !idSet.has(id)) return;
    const nx = Number.isFinite(node.x) ? node.x : 0;
    const ny = Number.isFinite(node.y) ? node.y : 0;
    const nw = Number.isFinite(node.width) && node.width > 0 ? node.width : 210;
    const nh = Number.isFinite(node.height) && node.height > 0 ? node.height : 64;

    minX = Math.min(minX, nx);
    maxX = Math.max(maxX, nx + nw);
    minY = Math.min(minY, ny);
    maxY = Math.max(maxY, ny + nh);
  });

  // Fallback if subset is empty or invalid
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    // If subset didn't match, calculate for all nodes
    if (idSet && idSet.size > 0 && layoutNodes.size > 0) {
      return calculateGraphBounds(layoutNodes, null);
    }
    minX = 0;
    maxX = 400;
    minY = 0;
    maxY = 300;
  }

  const graphWidth = Math.max(maxX - minX, 100);
  const graphHeight = Math.max(maxY - minY, 100);

  return {
    minX,
    maxX,
    minY,
    maxY,
    graphWidth,
    graphHeight,
    cx: minX + graphWidth / 2,
    cy: minY + graphHeight / 2,
  };
}

/**
 * Standardized Graph Viewport Hook:
 * - Deterministically centers and scales graph to fit container viewport width AND height
 * - Guarantees no important nodes start outside the visible screen
 * - Scales comfortably to occupy 75-85% of available canvas
 * - Responds to window / container size changes via ResizeObserver
 * - Smooth pan, drag, and zoom controls
 */
export function useGraphViewport(
  containerRef: React.RefObject<HTMLDivElement | null>,
  layoutNodes: Map<string, LayoutNode>,
  options: UseGraphViewportOptions = {}
) {
  const {
    padding = 28,
    minZoom = 0.25,
    maxZoom = 2.5,
    targetMaxZoom = 1.85,
    targetOccupancy = 0.88,
  } = options;

  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasUserInteractedRef = useRef<boolean>(false);
  const activeSubsetRef = useRef<string[] | Set<string> | null>(null);

  // Fit graph to bounds
  const fitGraph = useCallback(
    (subsetIds?: string[] | Set<string> | null) => {
      if (subsetIds !== undefined) {
        activeSubsetRef.current = subsetIds;
      }
      const targetSubset = subsetIds !== undefined ? subsetIds : activeSubsetRef.current;

      if (!containerRef.current || !layoutNodes || layoutNodes.size === 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;

      const bounds = calculateGraphBounds(layoutNodes, targetSubset);
      if (!bounds || bounds.graphWidth <= 0 || bounds.graphHeight <= 0) return;
      if (!Number.isFinite(bounds.graphWidth) || !Number.isFinite(bounds.graphHeight)) return;

      const safeWidth = Math.max(rect.width - padding * 2, 80);
      const safeHeight = Math.max(rect.height - padding * 2, 80);
      const availWidth = safeWidth * targetOccupancy;
      const availHeight = safeHeight * targetOccupancy;

      const scaleX = availWidth / bounds.graphWidth;
      const scaleY = availHeight / bounds.graphHeight;
      if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return;

      const fitScale = Math.min(scaleX, scaleY);
      const optimalZoom = Math.max(minZoom, Math.min(targetMaxZoom, fitScale));
      if (!Number.isFinite(optimalZoom) || optimalZoom <= 0) return;

      const newPanX = rect.width / 2 - bounds.cx * optimalZoom;
      const newPanY = rect.height / 2 - bounds.cy * optimalZoom;
      if (!Number.isFinite(newPanX) || !Number.isFinite(newPanY)) return;

      hasUserInteractedRef.current = false;

      setZoom((prev) => (Math.abs(prev - optimalZoom) > 0.001 ? optimalZoom : prev));
      setPan((prev) => (Math.abs(prev.x - newPanX) > 0.5 || Math.abs(prev.y - newPanY) > 0.5 ? { x: newPanX, y: newPanY } : prev));
    },
    [containerRef, layoutNodes, padding, minZoom, targetMaxZoom, targetOccupancy]
  );

  // Initial fit when layoutNodes or container changes
  useEffect(() => {
    let animationFrameId: number;

    const performInitialFit = () => {
      if (containerRef.current && layoutNodes && layoutNodes.size > 0) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          fitGraph(activeSubsetRef.current);
        }
      }
    };

    animationFrameId = requestAnimationFrame(performInitialFit);
    return () => cancelAnimationFrame(animationFrameId);
  }, [layoutNodes, fitGraph]);

  // ResizeObserver to automatically adjust on window/container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    let rafId: number | null = null;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          if (!hasUserInteractedRef.current) {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
              fitGraph(activeSubsetRef.current);
            });
          }
        }
      }
    });

    resizeObserver.observe(el);
    return () => {
      resizeObserver.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [containerRef, fitGraph]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    hasUserInteractedRef.current = true;
    setZoom((prev) => Math.min(maxZoom, +(prev * 1.2).toFixed(2)));
  }, [maxZoom]);

  const zoomOut = useCallback(() => {
    hasUserInteractedRef.current = true;
    setZoom((prev) => Math.max(minZoom, +(prev * 0.8).toFixed(2)));
  }, [minZoom]);

  // Mouse pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // only left click
      setIsDragging(true);
      hasUserInteractedRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      panStartRef.current = { ...pan };
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: panStartRef.current.x + dx,
        y: panStartRef.current.y + dy,
      });
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Wheel zoom around cursor
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      hasUserInteractedRef.current = true;
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      const nextZoom = Math.max(minZoom, Math.min(maxZoom, +(zoom * zoomFactor).toFixed(3)));

      const graphPointX = (cursorX - pan.x) / zoom;
      const graphPointY = (cursorY - pan.y) / zoom;

      const newPanX = cursorX - graphPointX * nextZoom;
      const newPanY = cursorY - graphPointY * nextZoom;

      setZoom(nextZoom);
      setPan({ x: newPanX, y: newPanY });
    },
    [containerRef, zoom, pan, minZoom, maxZoom]
  );

  return {
    zoom,
    pan,
    isDragging,
    fitGraph,
    zoomIn,
    zoomOut,
    setZoom,
    setPan,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
  };
}
