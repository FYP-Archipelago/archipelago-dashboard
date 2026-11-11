import React from 'react';

export default function AboutPage() {
  return (
    <section className="about-page">
      <header className="page-head">
        <h1>About</h1>
        <p className="question">Visual analysis of distributed evolutionary search.</p>
      </header>
      <div className="prose narrow">
        <p>
          Archipelago represents island-model evolutionary search as a clustered search trajectory network. Backend analysis provides evaluation
          clusters, trajectory edges, migration routes, fitness statistics and inter-island separation.
        </p>
        <p>
          <b>Runs</b> configures execution and clustering. <b>Archipelago</b> presents the resulting network; migration and clustering views report
          run-specific statistics. <b>Explainability</b> attributes recorded fitness improvement to islands and directed migration routes using
          lineage-based Shapley values.
        </p>
        <p>
          Graph controls support island and path filtering, migration visibility, metric-based height encoding and cluster inspection. Camera
          controls: drag to rotate, scroll to zoom and select a node to inspect its attributes.
        </p>
      </div>
    </section>
  );
}
