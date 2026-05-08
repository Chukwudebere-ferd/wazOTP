const fs = require('fs');
const path = require('path');
const firebaseConfig = require('../lib/firebase-config');

async function dashboardRoutes(fastify) {
  fastify.get('/dashboard', async (_, reply) => {
    const html = fs.readFileSync(path.join(__dirname, '../views/dashboard.html'), 'utf8');
    reply.type('text/html').send(html);
  });

  fastify.get('/dashboard.css', async (_, reply) => {
    const css = fs.readFileSync(path.join(__dirname, '../views/dashboard.css'), 'utf8');
    reply.type('text/css').send(css);
  });

  fastify.get('/dashboard.js', async (_, reply) => {
    const js = fs.readFileSync(path.join(__dirname, '../views/dashboard.js'), 'utf8');
    reply.type('application/javascript').send(js);
  });

  fastify.get('/v1/dashboard/firebase-config', async () => ({
    success: true,
    data: firebaseConfig,
  }));
}

module.exports = dashboardRoutes;
