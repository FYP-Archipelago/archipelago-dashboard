import type { ReactNode } from 'react';

import Icon from '@/components/Icon.tsx';
import Link from '@/components/Link.tsx';
import { RUN_TAB_LABELS, runHref, type RunTab } from '@/route.ts';

// A card that sums up another tab, with a link to it.
export default function OverviewCard({
  title,
  subtitle,
  runId,
  tab,
  className,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  runId: string;
  tab: RunTab;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card overview-card${className ? ` ${className}` : ''}`}>
      <div className="card-header">
        {subtitle ? (
          <div className="card-heading">
            <h3>{title}</h3>
            <span className="muted">{subtitle}</span>
          </div>
        ) : (
          <h3>{title}</h3>
        )}
        <Link className="overview-card-link card-header-end" href={runHref(runId, tab)}>
          {RUN_TAB_LABELS[tab]}
          <Icon name="arrowR" size={13} />
        </Link>
      </div>
      {children}
    </section>
  );
}
