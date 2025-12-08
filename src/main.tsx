import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Check if running inside Forma iframe (has origin parameter)
const urlParams = new URLSearchParams(window.location.search);
const isInsideForma = urlParams.has('origin') || window.parent !== window;

// Only import App if inside Forma (to avoid SDK init errors)
if (isInsideForma || urlParams.has('force')) {
  import('./App.tsx').then(({ default: App }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }).catch(err => {
    console.error('Failed to load App:', err);
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <div style="padding: 20px; color: #ff6b6b;">
          <h2>Failed to load application</h2>
          <p>${err.message}</p>
          <p>This extension must run inside Forma.</p>
          <p style="color: #aaa; font-size: 14px; margin-top: 16px;">
            If you are having issues, please close and reopen the extension.
          </p>
        </div>
      `;
    }
  });
} else {
  // Show message when accessed directly (not in Forma)
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding: 40px; text-align: center; font-family: system-ui, sans-serif;">
        <h1 style="color: #9cff80; margin-bottom: 20px;">✓ Authentication Successful!</h1>
        <p style="color: #ccc; font-size: 18px; margin-bottom: 30px;">
          You are logged in. This extension needs to run inside Forma.
        </p>
        <div style="background: #2a2a2a; padding: 20px; border-radius: 8px; display: inline-block; text-align: left;">
          <p style="color: #888; margin: 0 0 10px 0;">To use this extension:</p>
          <ol style="color: #aaa; margin: 0; padding-left: 20px;">
            <li>Open Forma in your browser</li>
            <li>Go to Extensions panel</li>
            <li>Select this extension</li>
          </ol>
        </div>
        <p style="color: #888; font-size: 13px; margin-top: 20px;">
          If you are having issues, please close and reopen the extension.
        </p>
        <p style="color: #666; font-size: 12px; margin-top: 10px;">
          Developer: Add <code>?force</code> to URL to bypass this check
        </p>
      </div>
    `;
  }
}
