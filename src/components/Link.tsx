import type { AnchorHTMLAttributes, MouseEvent } from 'react';

import { navigate } from '@/route.ts';

// Navigates in place for plain left clicks; modified clicks keep the browser's new-tab behaviour.
export default function Link({ href, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick'> & { href: string }) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
  return <a {...props} href={href} onClick={handle} />;
}
