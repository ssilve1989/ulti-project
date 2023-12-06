module.exports = {
  apps: [
    {
      autorestart: true,
      script: 'dist/main.js',
      FORCE_COLOR: 1,
      name: 'ulti-project-bot',
      env: {
        CLIENT_ID: '1134625038449000551',
        GUILD_ID: '913492538516717578',
        PUBLIC_KEY:
          'd1c58a67436ed1b8d0dd184d97d6b0140aabc49d526f614623b6a82418b1b4e0',
      },
    },
  ],
};
