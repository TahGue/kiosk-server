module.exports = {
  apps: [
    {
      name: 'kiosk-server',
      script: './server.js',
      cwd: __dirname,
      
      // Cluster mode with 2 instances (adjust based on CPU cores)
      instances: 2,
      exec_mode: 'cluster',
      
      // Auto restart on file changes (disable in production)
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git', '.env', 'config/*.json'],
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        CORS_ORIGIN: 'http://localhost:4000,http://localhost:3000', // Add your domains
        FORCE_HTTPS: 'false',
        
        // Security limits
        MAX_SSE_CLIENTS: '100',
        MAX_HB_CLIENTS: '200',
        MAX_HEARTBEAT_RATE: '120',
        MAX_COMMAND_QUEUE_SIZE: '100',
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 4000,
        CORS_ORIGIN: '*',
      },
      
      // Logging configuration
      log_file: './logs/combined.log',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      
      // Auto restart settings
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '500M',
      
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 3000,
      
      // Node.js arguments
      node_args: '--max-old-space-size=512',
      
      // Monitoring
      autorestart: true,
      exp_backoff_restart_delay: 100,
    }
  ],
  
  // Deploy configuration (optional)
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/kiosk-server.git',
      path: '/var/www/kiosk-server',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
