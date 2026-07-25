import React from 'react';
import ReactDOM from 'react-dom/client';
// Order matters: legacy index.css ships old CSS variables and component
// styles. globals.css loads after so the new design-token values win on
// body, scrollbar and focus rules.
import './index.css';
import './styles/globals.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
