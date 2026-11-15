import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { queryClient } from '@/lib/queryClient';
import { routes } from '@/routes';
import '@/styles/global.css';
// Applies the theme and language choices and keeps them in step with the system.
import '@/state/appearance';
import '@/lib/i18n';
import { startListeningStats } from '@/playback/listeningStats';
import { startQueueHistory } from '@/playback/queueHistory';

const router = createBrowserRouter(routes);

// Counts what you listen to (the Stats page) and keeps the queues you play (Up Next › History).
startListeningStats();
startQueueHistory();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

// The service worker makes the site installable as an app (public/sw.js). Only
// in a production build: in development it would stand between Vite and its updates.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => console.warn('Etify: service worker', error));
  });
}
