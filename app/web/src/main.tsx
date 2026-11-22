import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './styles/design-system.css';
import { applyTheme, useTheme } from './store/theme';
import { queryClient } from './api/query-client';

applyTheme(useTheme.getState().theme);

// Optional sub-path hosting (e.g. https://example.com/pos). Leave unset at the domain root.
const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basePath || undefined}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
