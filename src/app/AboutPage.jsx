import React from 'react';

export default function AboutPage(){
  return <section className="about-page"><header className="page-head"><h1>About</h1><p className="question">Explaining what a distributed evolutionary algorithm actually did.</p></header>
    <div className="prose narrow"><p>Archipelago shows how islands searched and what changed when individuals migrated between them. The backend runs the algorithm, clusters evaluations and supplies graph nodes, paths, migrations and island separation data.</p><p>Open <b>Runs</b> to start a backend run. Open <b>Archipelago</b> to explore its search trajectory network. <b>Scale study</b> uses generated data to exercise the same viewer at a larger scale.</p><p>In the graph, drag to rotate, scroll to zoom and click a node to inspect its backend values. Use the right-side controls to separate islands, filter paths, inspect migration routes and jump to best clusters.</p></div>
  </section>;
}
