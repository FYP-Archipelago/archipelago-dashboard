import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate } from './route.ts';

// Navigates in place for plain left clicks; modified clicks keep the browser's new-tab behaviour.
export default function Link({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...props} />;
}
