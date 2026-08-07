import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { AuthProvider } from './auth/AuthProvider';
import { createApiClient } from './api/client';
import './styles.css';
const client = createApiClient();
createRoot(document.getElementById('root')!).render(<AuthProvider client={client}><BrowserRouter basename={import.meta.env.BASE_URL}><App /></BrowserRouter></AuthProvider>);
