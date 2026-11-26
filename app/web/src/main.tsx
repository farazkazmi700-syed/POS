import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './styles/design-system.css';
import './styles/appearance.css';
import { applyTheme, useTheme } from './store/theme';
import { applyAppearance, readAppearance } from './store/appearance';
import { useAuth } from './store/auth';
import { queryClient } from './api/query-client';

const user = useAuth.getState().user;
if (user?.tenantId && !user.isDeveloper && !user.isSuperAdmin) applyAppearance(readAppearance(user.tenantId));
else applyTheme(useTheme.getState().theme);

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
