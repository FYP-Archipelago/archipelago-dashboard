import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import './dialog.css';

// A box in the middle of the screen over a dimmed page. Escape or a click outside closes it unless it is busy.
export default function Dialog({
  title,
  busy = false,
  onClose,
  children,
}: {
  title: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const page = document.getElementById('root');
    page?.setAttribute('inert', '');
    return () => {
      page?.removeAttribute('inert');
      before?.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !busy) return onClose();
    if (event.key !== 'Tab' || !box.current) return;
    // Tab wraps around inside the box rather than moving on to the browser's own controls
    const controls = [...box.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]')];
    const edge = event.shiftKey ? controls[0] : controls.at(-1);
    if (document.activeElement !== edge) return;
    event.preventDefault();
    (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
  };

  return createPortal(
    <div className="dialog-overlay" onKeyDown={onKeyDown} onPointerDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div ref={box} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body
  );
}
