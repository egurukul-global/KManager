import { spawn } from 'child_process';

console.log('Starting One Kailasa dev environment...');

// Start the API Server on port 3000
const apiServer = spawn('node', ['scripts/dev-server.mjs'], { 
  stdio: 'inherit', 
  shell: true 
});

// Start the Vite SPA Server on port 5173
const viteServer = spawn('node', ['node_modules/vite/bin/vite.js'], { 
  stdio: 'inherit', 
  shell: true 
});

// Handle termination safely
const cleanup = () => {
  console.log('\nStopping servers...');
  apiServer.kill();
  viteServer.kill();
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
