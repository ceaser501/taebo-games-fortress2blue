const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = merge(common, {
  mode: 'production',
  // Maps and sounds are big on purpose; size hints would only be noise.
  performance: { hints: false },
  plugins: [
    new CopyPlugin({
      patterns: [
        // Site-wide: the root page (forwards to fortress/) and shared icons.
        { from: 'index.html', to: 'index.html' },
        { from: 'robots.txt', to: 'robots.txt' },
        { from: 'favicon.ico', to: 'favicon.ico' },
        { from: 'icon.png', to: 'icon.png' },
        { from: 'icon.svg', to: 'icon.svg' },
        { from: '404.html', to: '404.html' },
        { from: 'site.webmanifest', to: 'site.webmanifest' },
        // Fortress
        { from: 'fortress/index.html', to: 'fortress/index.html' },
        { from: 'fortress/css', to: 'fortress/css' },
        { from: 'fortress/assets', to: 'fortress/assets', noErrorOnMissing: true },
      ],
    }),
  ],
});
