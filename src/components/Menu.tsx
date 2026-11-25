import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import Icon, { type IconName } from './Icon.tsx';

import './menu.css';

type MenuItem = { label: string; icon: IconName; onSelect: () => void; danger?: boolean; disabled?: string };

export default function Menu({
  label,
  items,
  icon = 'dotsVertical',
  align = 'end',
  className = '',
}: {
  label: string;
  items: MenuItem[];
  icon?: 'dotsVertical' | 'dotsHorizontal';
  align?: 'start' | 'end';
  className?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const open = place !== null;

  const show = () => {
    const rect = trigger.current!.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom > items.length * 32 + 24;
    setPlace({
      ...(below ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }),
      ...(align === 'start' ? { left: rect.left } : { right: window.innerWidth - rect.right }),
      transformOrigin: `${below ? 'top' : 'bottom'} ${align === 'start' ? 'left' : 'right'}`,
    });
  };
  const close = () => {
    setPlace(null);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const dismiss = () => setPlace(null);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!list.current?.contains(target) && !trigger.current?.contains(target)) dismiss();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') return close();
    if (event.key === 'Tab') return setPlace(null);
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const enabled = [...list.current!.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')];
    const at = enabled.indexOf(document.activeElement as HTMLElement);
    enabled[(at + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]?.focus();
  };

  return (
    <>
      <button
        ref={trigger}
        className={`menu-trigger ${className}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setPlace(null) : show())}
      >
        <Icon name={icon} size={16} />
      </button>
      {place &&
        createPortal(
          <div ref={list} className="menu" role="menu" aria-label={label} style={place} onKeyDown={onKeyDown}>
            {items.map((item, i) => (
              <div key={item.label} className="menu-entry" title={item.disabled}>
                {item.danger && i > 0 && !items[i - 1]?.danger && <div className="menu-separator" role="separator" />}
                <button
                  role="menuitem"
                  className={`menu-item${item.danger ? ' menu-item-danger' : ''}`}
                  disabled={Boolean(item.disabled)}
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                >
                  <Icon name={item.icon} size={15} />
                  {item.label}
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
