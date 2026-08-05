import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { AuthProvider } from './auth/AuthProvider';
import type { AuthClient } from './api/client';
const client: AuthClient = { getSession: async () => ({ userId: 'demo', roleKey: 'admin', abilities: ['*'] }) };
createRoot(document.getElementById('root')!).render(<AuthProvider client={client}><BrowserRouter><App /></BrowserRouter></AuthProvider>);
