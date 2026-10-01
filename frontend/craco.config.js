// craco.config.js
const path = require("path");
require("dotenv").config();

// Environment variable overrides
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
};

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

let webpackConfig = {
  jest: {
    configure: {
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
    },
  },
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {

      // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
        ],
      };

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }
      return webpackConfig;
    },
  },
};

webpackConfig.devServer = (devServerConfig) => {
  // CRA 5 supplies the removed v4 hooks. Keep their middleware ordering on v5.
  const before = devServerConfig.onBeforeSetupMiddleware;
  const after = devServerConfig.onAfterSetupMiddleware;
  const setup = devServerConfig.setupMiddlewares;
  delete devServerConfig.onBeforeSetupMiddleware;
  delete devServerConfig.onAfterSetupMiddleware;
  const https = devServerConfig.https;
  delete devServerConfig.https;
  if (https) devServerConfig.server = { type: 'https', options: https === true ? {} : https };
  devServerConfig.host = process.env.HOST || '127.0.0.1';
  devServerConfig.allowedHosts = ['localhost', '127.0.0.1', ...
    (process.env.DEV_ALLOWED_HOSTS || '').split(',').map(host => host.trim()).filter(Boolean)];
  // Do not override the dev server's same-origin resource protection with CRA's wildcard CORS.
  devServerConfig.headers = { 'Cross-Origin-Resource-Policy': 'same-origin' };
  devServerConfig.setupMiddlewares = (middlewares, server) => {
    if (before) before(server);
    if (setup) middlewares = setup(middlewares, server);
    // Register CRA's trailing fallbacks after built-in dev middleware.
    if (after) middlewares.push({ name: 'cra-fallbacks', middleware: (() => {
      const express = require('express');
      const router = express.Router();
      after({ ...server, app: router });
      return router;
    })() });
    return middlewares;
  };
  // Add health check endpoints if enabled
  if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
    const originalSetupMiddlewares = devServerConfig.setupMiddlewares;

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Call original setup if exists
      if (originalSetupMiddlewares) {
        middlewares = originalSetupMiddlewares(middlewares, devServer);
      }

      // Setup health endpoints
      setupHealthEndpoints(devServer, healthPluginInstance);

      return middlewares;
    };
  }

  return devServerConfig;
};

module.exports = webpackConfig;
