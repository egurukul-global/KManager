export function registerServiceWorker() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('ServiceWorker registered:', registration);
          
          const channel = new BroadcastChannel('auth-migration');
          channel.onmessage = (event) => {
            if (event.data.type === 'MIGRATION_SUCCESS') {
              window.dispatchEvent(new CustomEvent('auth-migrated', {
                detail: event.data
              }));
            }
          };
          
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data.type === 'START_SYNC') {
              window.dispatchEvent(new CustomEvent('start-sync'));
            }
          });
        })
        .catch((error) => {
          console.error('ServiceWorker registration failed:', error);
        });
    });
  }
}
