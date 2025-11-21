module.exports = {
  apps: [
    {
      name: 'kiosk-client',
      script: './start-kiosk.sh',
      cwd: __dirname,
      interpreter: '/bin/bash',
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        DISPLAY: ':0', // Required for GUI apps
        // SERVER_BASE: 'http://10.1.1.63:4000' // Optional: Override server URL
      },
      
      // Auto restart settings
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000, // Wait 5 seconds before restarting
      
      // Logging
      out_file: './logs/client-out.log',
      error_file: './logs/client-error.log',
      time: true,
    }
  ]
};
