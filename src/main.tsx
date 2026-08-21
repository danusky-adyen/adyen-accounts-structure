import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import { applyTheme, installDesignTokens } from './design/theme';
import { startPersistence, useStore } from './state/store';
import './styles/global.css';

installDesignTokens();
applyTheme(useStore.getState().theme);
startPersistence();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
