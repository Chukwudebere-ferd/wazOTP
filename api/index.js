'use strict';

const { prepareApp } = require('../src/app');

let appPromise;

module.exports = async (req, res) => {
  if (!appPromise) {
    appPromise = prepareApp();
  }

  const app = await appPromise;
  app.server.emit('request', req, res);
};
