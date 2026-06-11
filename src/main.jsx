import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL}service-worker.js`
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        console.log('✓ Service Worker registered:', registration)
      })
      .catch((error) => {
        console.error('✗ Service Worker registration failed:', error)
      })
  })
} else {
  console.warn('Service Workers are not supported in this browser')
}
