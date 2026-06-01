'use strict';

const { prepareApp } = require('../src/app');

let appPromise;

module.exports = async (req, res) => {
  try {
    if (!appPromise) {
      appPromise = prepareApp();
    }

    const app = await appPromise;
    app.server.emit('request', req, res);
  } catch (error) {
    console.error('Vercel handler bootstrap failed:', error);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        success: false,
        message: error.message || 'Server bootstrap failed',
      }));
    }
  }
};
