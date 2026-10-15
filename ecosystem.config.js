// PM2 na VPS "websites": pm2 start ecosystem.config.js && pm2 save
// Port 3006 (3000-3005 zajmują pozostałe strony); nginx robi reverse proxy z TLS.
module.exports = {
  apps: [
    {
      name: 'bookowska-website',
      script: 'app.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: 3006,
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      min_uptime: '10s',
      max_memory_restart: '200M',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
