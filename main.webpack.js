const path = require('path');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  node: {
    __dirname: false
  },
  mode: 'none',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        include: [
          path.resolve(__dirname, "src/background"),
          path.resolve(__dirname, "main.ts"),
        ]
      },
      {
        test: /\.node$/,
        loader: "node-loader",
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js', '.node'],
    plugins: [
      new TsconfigPathsPlugin({
        configFile: path.resolve(__dirname, "tsconfig.serve.json")
      })
    ]
  },
  plugins: [
    // CopyPlugin removed as server directory no longer exists
  ],
  target: 'electron-main',
  entry: './main.ts',
  output: {
    filename: 'background-bundle.js',
    path: path.resolve(__dirname, 'dist')
  },
};
