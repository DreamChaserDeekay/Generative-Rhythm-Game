import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { watchUiScale } from './ui/uiScale';
import './styles.css';

// before the first paint, so no screen is ever drawn at another size
watchUiScale();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
