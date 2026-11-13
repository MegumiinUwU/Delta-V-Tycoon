import '@fontsource/press-start-2p';
import '@fontsource/vt323';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './ui/styles/base.css';
import './ui/styles/motion.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
