module.exports = {
  apps: [
    {
      autorestart: true,
      script: 'dist/main.js',
      FORCE_COLOR: 1,
      name: 'ulti-project-bot',
    },
  ],
};
