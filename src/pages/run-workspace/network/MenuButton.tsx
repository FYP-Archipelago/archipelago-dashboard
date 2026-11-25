import { useEffect, useRef, type ReactNode } from 'react';

// Which menu is open; one at a time across the toolbar and the legend.
export type Menu = 'height' | 'paths' | 'routes' | 'help';

// A button with a panel under it. The panel closes on a click outside the pair or on Escape.
export default function MenuButton({
  open,
  onOpen,
  onClose,
  button,
  label,
  className = '',
  align = 'start',
  children,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  button: ReactNode;
  label: string;
  className?: string;
  align?: 'start' | 'end';
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => !root.current?.contains(event.target as Node) && onClose();
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && (event.stopPropagation(), onClose());
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open, onClose]);
  return (
    <div ref={root} className={`network-menu ${className}`}>
      <button
        className={`network-menu-button${open ? ' network-menu-button-open' : ''}`}
        aria-expanded={open}
        aria-label={label}
        onClick={open ? onClose : onOpen}
      >
        {button}
      </button>
      {open && (
        <div className={`network-panel network-panel-${align}`} role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}
