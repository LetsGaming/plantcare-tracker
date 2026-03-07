module.exports = {
  apps: [
    {
      name: "plantcare-backend",
      script: "scripts/start.js",
      cwd: "./",
      env: {
        NODE_ENV: "development"
      },
      env_production: {
        NODE_ENV: "production"
      },
      watch: false
    }
  ]
};