import React, { useEffect, useRef, useState } from 'react';
import { mountStnViewer } from '../viewer/stn-viewer.js';
import { STUDY_DATASETS, studyDataset } from '../viewer/study-data.js';
import '../viewer/stn-viewer.css';

export default function StudyPage() {
  const [dataset, setDataset] = useState(STUDY_DATASETS[0]);
  const host = useRef(null);
  useEffect(() => {
    const viewer = mountStnViewer(host.current, { datasets: [studyDataset(dataset)] });
    return () => viewer.destroy();
  }, [dataset]);
  return (
    <section className="study-page">
      <header className="page-head">
        <h1>Scale study</h1>
        <p className="question">Does this view still read at 400,000 evaluations, with more islands or many runs?</p>
        <details className="reading">
          <summary>How to read this</summary>
          <div className="deck">
            Synthetic runs exercise the same WebGL viewer at a larger scale. They are generated in your browser and are separate from backend results.
          </div>
        </details>
      </header>
      <div className="study-bar">
        <div className="view-tabs" role="group" aria-label="Choose a dataset">
          {STUDY_DATASETS.map((item) => (
            <button type="button" key={item.id} aria-pressed={dataset.id === item.id} title={item.detail} onClick={() => setDataset(item)}>
              {item.label}
            </button>
          ))}
        </div>
        <span className="synthetic">Synthetic data</span>
        <span className="study-detail">{dataset.detail}, generated in your browser</span>
      </div>
      <div className="viewer-host study-host" ref={host} />
    </section>
  );
}
