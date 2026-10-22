const path = require('path');

// The bundle lands in fortress/js/app.js, next to the page that loads it.
module.exports = {
  entry: {
    fortress: './fortress/js/app.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    filename: '[name]/js/app.js',
    chunkFilename: 'fortress/js/chunk-[id].js',
  },
};
