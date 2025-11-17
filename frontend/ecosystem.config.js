module.exports = {
  apps: [{
    name: 'webarmonium-frontend',
    script: 'npx',
    args: 'http-server . -p 3000 --cors --gzip',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // Configuration for production deployment
    error_file: '/var/log/webarmonium/frontend-error.log',
    out_file: '/var/log/webarmonium/frontend-out.log',
    log_file: '/var/log/webarmonium/frontend-combined.log',
    time: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    node_args: '--max-old-space-size=512',

    // Health check
    health_check_grace_period: 3000,
    health_check_fatal_exceptions: true,

    // Deployment specific
    kill_timeout: 5000,
    restart_delay: 5000,

    // Monitoring
    pmx: true,

    // Working directory
    cwd: '/var/www/webarmonium/frontend'
  }]
};