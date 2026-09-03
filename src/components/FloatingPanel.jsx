import { useCallback, useRef, useState } from 'react';
import { GripHorizontal } from 'lucide-react';

export default function FloatingPanel({
  id,
  title,
  className = '',
  zIndex,
  onFocus,
  defaultPosition,
  defaultSize,
  minSize = { width: 220, height: 140 },
  children
}) {
  const [position, setPosition] = useState(defaultPosition);
  const [size, setSize] = useState(defaultSize);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragState = useRef(null);
  const resizeState = useRef(null);

  const onHeaderPointerDown = useCallback((event) => {
    onFocus?.(id);
    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [position, id, onFocus]);

  const onHeaderPointerMove = useCallback((event) => {
    if (!dragState.current) return;
    const dx = event.clientX - dragState.current.startX;
    const dy = event.clientY - dragState.current.startY;
    setPosition({ x: dragState.current.originX + dx, y: dragState.current.originY + dy });
  }, []);

  const stopHeaderDrag = useCallback((event) => {
    dragState.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onResizePointerDown = useCallback((event) => {
    event.stopPropagation();
    onFocus?.(id);
    resizeState.current = {
      startX: event.clientX,
      startY: event.clientY,
      originWidth: size.width,
      originHeight: size.height
    };
    setResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [size, id, onFocus]);

  const onResizePointerMove = useCallback((event) => {
    if (!resizeState.current) return;
    const dx = event.clientX - resizeState.current.startX;
    const dy = event.clientY - resizeState.current.startY;
    setSize({
      width: Math.max(minSize.width, resizeState.current.originWidth + dx),
      height: Math.max(minSize.height, resizeState.current.originHeight + dy)
    });
  }, [minSize]);

  const stopResize = useCallback((event) => {
    resizeState.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <div
      className={`floating-panel ${className}`}
      style={{ left: position.x, top: position.y, width: size.width, height: size.height, zIndex }}
      onPointerDownCapture={() => onFocus?.(id)}
    >
      <div
        className={`floating-panel-header ${dragging ? 'dragging' : ''}`}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={stopHeaderDrag}
        onPointerCancel={stopHeaderDrag}
      >
        <GripHorizontal size={14} />
        <span>{title}</span>
      </div>
      <div className="floating-panel-body">{children}</div>
      <div
        className={`floating-panel-resize ${resizing ? 'resizing' : ''}`}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
        title="크기 조절"
      />
    </div>
  );
}
