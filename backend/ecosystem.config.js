module.exports = {
  apps: [{
    name: 'webarmonium-backend',
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'development',
      PORT: 3001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
      HOST: '0.0.0.0'
    },
    // Configuration for production deployment
    error_file: '/var/log/webarmonium/backend-error.log',
    out_file: '/var/log/webarmonium/backend-out.log',
    log_file: '/var/log/webarmonium/backend-combined.log',
    time: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    node_args: '--max-old-space-size=1024',

    // Health check
    health_check_grace_period: 3000,
    health_check_fatal_exceptions: true,

    // Deployment specific
    kill_timeout: 5000,
    restart_delay: 5000,

    // Monitoring
    pmx: true,

    // Cluster settings
    instance_var: 'INSTANCE_ID',
    generate_etc_hosts: true
  }]
};