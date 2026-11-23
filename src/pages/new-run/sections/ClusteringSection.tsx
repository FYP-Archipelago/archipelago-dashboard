import { Fragment } from 'react';

import Icon from '@/components/Icon.tsx';
import type { ClusteringStage } from '@/format.ts';
import { ADVANCED, DETAIL_MAX, DETAIL_MIN, STAGES, type AdvancedKey, type ClusterForm } from '@/pages/new-run/form.ts';
import { seeded, type Point } from '@/pages/new-run/shared.ts';
import { vars } from '@/style.ts';

import { NumberField, Switch } from './fields.tsx';

import './clustering.css';

type ClusteringProps = {
  clustering: ClusterForm;
  errors: Record<string, string>;
  patchCluster: (change: Partial<ClusterForm>) => void;
  setClusterText: (key: AdvancedKey) => (value: string) => void;
};

// Fixed sample points for the detail preview: three loose blobs.
const PREVIEW_POINTS: Point[] = (() => {
  const random = seeded('');
  const centres = [
    [56, 40],
    [140, 30],
    [222, 48],
  ];
  return centres.flatMap(([cx, cy]) => Array.from({ length: 14 }, () => [cx! + (random() - 0.5) * 78, cy! + (random() - 0.5) * 46] as Point));
})();

// Groups the preview points the way BIRCH does: join the first cluster within the radius, else start one.
function previewClusters(detail: number) {
  // A radius of 30 at detail 1; detail divides it, as it divides the auto BIRCH threshold.
  const reach = 30 / detail;
  const clusters: { x: number; y: number; points: Point[] }[] = [];

  for (const point of PREVIEW_POINTS) {
    const near = clusters.find((cluster) => Math.hypot(cluster.x - point[0], cluster.y - point[1]) <= reach);
    if (!near) {
      clusters.push({ x: point[0], y: point[1], points: [point] });
      continue;
    }
    near.points.push(point);
    near.x = near.points.reduce((sum, member) => sum + member[0], 0) / near.points.length;
    near.y = near.points.reduce((sum, member) => sum + member[1], 0) / near.points.length;
  }

  return clusters.map((cluster) => {
    const offsets = cluster.points.map((member) => [member[0] - cluster.x, member[1] - cluster.y] as Point);
    const aspect = (Math.max(...offsets.map(([dx]) => Math.abs(dx))) + 1) / (Math.max(...offsets.map(([, dy]) => Math.abs(dy))) + 1);
    const scale = Math.max(...offsets.map(([dx, dy]) => Math.hypot(dx / aspect, dy)));
    return {
      ...cluster,
      rx: Math.min(aspect * scale + 5, cluster.x - 1, 279 - cluster.x),
      ry: Math.min(scale + 5, cluster.y - 1, 83 - cluster.y),
    };
  });
}

function DetailPreview({ detail, active }: { detail: number; active: boolean }) {
  const clusters = previewClusters(detail);

  return (
    <div className={`detail-preview${active ? '' : ' clustering-detail-unused'}`}>
      <svg viewBox="0 0 280 84" aria-hidden="true">
        {clusters.map((cluster, i) => (
          <ellipse key={`c${i}`} className="detail-preview-cluster" cx={cluster.x} cy={cluster.y} rx={cluster.rx} ry={cluster.ry} />
        ))}
        {PREVIEW_POINTS.map(([x, y], i) => (
          <circle key={i} className="detail-preview-point" cx={x} cy={y} r={1.8} />
        ))}
      </svg>
      <span className="detail-preview-count">{active ? `${clusters.length} clusters in this sample` : 'Only applies to BIRCH and DenStream'}</span>
    </div>
  );
}

function DetailSlider({ clustering, patchCluster }: Pick<ClusteringProps, 'clustering' | 'patchCluster'>) {
  const detailApplies = clustering.birch || clustering.denstream;
  const shareOf = (detail: number) => ((detail - DETAIL_MIN) / (DETAIL_MAX - DETAIL_MIN)) * 100;

  return (
    <div className={`detail-slider${detailApplies ? '' : ' clustering-detail-unused'}`}>
      <div className="detail-slider-header">
        <label htmlFor="f-detail">Detail</label>
        <span className="detail-slider-value numeric">
          {clustering.detail.toFixed(1)}
          {clustering.detail === 1 && <em>default</em>}
        </span>
      </div>
      <input
        id="f-detail"
        type="range"
        min={DETAIL_MIN}
        max={DETAIL_MAX}
        step={0.1}
        value={clustering.detail}
        disabled={!detailApplies}
        style={vars({ '--fill': `${shareOf(clustering.detail)}%` })}
        onChange={(event) => patchCluster({ detail: Number(event.target.value) })}
      />
      <div className="detail-slider-ticks">
        {[0.5, 1, 1.5, 2].map((tick) => (
          <button
            key={tick}
            className={`numeric${clustering.detail === tick ? ' detail-slider-tick-selected' : ''}`}
            style={{ left: `${shareOf(tick)}%` }}
            disabled={!detailApplies}
            onClick={() => patchCluster({ detail: tick })}
          >
            {tick.toFixed(1)}
          </button>
        ))}
      </div>
      <div className="detail-slider-endpoints">
        <small>Coarse · fewer, bigger clusters</small>
        <small>Fine · more, smaller clusters</small>
      </div>
    </div>
  );
}

function AdvancedPanel({ clustering, errors, patchCluster, setClusterText }: ClusteringProps) {
  const groups = [...STAGES.map((stage) => ({ key: stage.key as ClusteringStage | null, label: stage.label })), { key: null, label: 'General' }];
  const settingCount = ADVANCED.filter((field) => !field.stage || clustering[field.stage]).length + 1;

  return (
    <details className="clustering-advanced">
      <summary>
        <Icon name="chevR" size={14} />
        <span className="advanced-settings-title">Advanced Clustering Settings</span>
        <span className="advanced-settings-summary">
          {settingCount} settings · detail {clustering.detail.toFixed(1)}
        </span>
      </summary>
      <div className="advanced-settings-body">
        <div className="advanced-settings-detail">
          <DetailSlider clustering={clustering} patchCluster={patchCluster} />
          <DetailPreview detail={clustering.detail} active={clustering.birch || clustering.denstream} />
        </div>
        <div className="advanced-settings-groups">
          {groups.map((group) => {
            const enabled = !group.key || clustering[group.key];
            return (
              <div key={group.label} className={`advanced-settings-group${enabled ? '' : ' clustering-group-off'}`}>
                <div className="advanced-settings-group-header">
                  <strong>{group.label}</strong>
                  {group.key && (
                    <span className={`clustering-stage-pill${enabled ? ' clustering-stage-pill-on' : ''}`}>{enabled ? 'On' : 'Off'}</span>
                  )}
                </div>
                {ADVANCED.filter((field) => field.stage === group.key).map((field) => (
                  <NumberField
                    key={field.key}
                    id={`f-cl-${field.key}`}
                    label={field.label}
                    value={clustering.text[field.key]}
                    onChange={setClusterText(field.key)}
                    error={enabled ? errors[`clustering.${field.key}`] : undefined}
                    hint={field.hint}
                    placeholder={field.rule.optional ? 'Auto' : undefined}
                    decimal={!field.rule.int}
                    disabled={!enabled}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}

export default function ClusteringSection(props: ClusteringProps) {
  const { clustering, errors, patchCluster } = props;

  return (
    <section className="new-run-step">
      <h2>Clustering</h2>
      <p className="new-run-step-description">How evaluations are grouped in the network.</p>
      <div className="clustering-pipeline">
        {STAGES.map((stage, i) => (
          <Fragment key={stage.key}>
            {i > 0 && (
              <span className="clustering-stage-arrow">
                <Icon name="arrowR" size={14} />
              </span>
            )}
            <button
              className={`clustering-stage${clustering[stage.key] ? ' clustering-stage-on' : ''}`}
              role="switch"
              aria-checked={clustering[stage.key]}
              onClick={() => patchCluster({ [stage.key]: !clustering[stage.key] })}
            >
              <span className="clustering-stage-title">
                <strong>{stage.label}</strong>
                <Switch on={clustering[stage.key]} />
              </span>
              <p>{stage.text}</p>
            </button>
          </Fragment>
        ))}
      </div>
      {errors.stages && <p className="field-error field-error-block">{errors.stages}</p>}
      <AdvancedPanel {...props} />
    </section>
  );
}
