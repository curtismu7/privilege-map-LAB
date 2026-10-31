import React from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './fonts.css';
import './standalone-ui.css';
import './styles.css';
import './diagram/diagram.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
