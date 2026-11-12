import React from 'react';
import { createRoot } from 'react-dom/client';
import DashboardApp from './app/DashboardApp.jsx';
import './style.css';
import './designs.css';
import './app/workspace.css';

const root = import.meta.hot?.data.root || createRoot(document.getElementById('root'));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<DashboardApp />);
