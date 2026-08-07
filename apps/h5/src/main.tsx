import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './app/router';
import './styles.css';
createRoot(document.getElementById('root')!).render(<BrowserRouter basename={import.meta.env.BASE_URL}><AppRouter /></BrowserRouter>);
