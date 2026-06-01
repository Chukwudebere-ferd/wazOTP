const fs = require('fs');
const path = require('path');
const firebaseConfig = require('../lib/firebase-config');

async function dashboardRoutes(fastify) {
  fastify.get('/dashboard', async (_, reply) => {
    const html = fs.readFileSync(path.join(__dirname, '../views/dashboard.html'), 'utf8');
    reply
      .header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .type('text/html')
      .send(html);
  });

  fastify.get('/dashboard.css', async (_, reply) => {
    const css = fs.readFileSync(path.join(__dirname, '../views/dashboard.css'), 'utf8');
    reply
      .header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .type('text/css')
      .send(css);
  });

  fastify.get('/dashboard-client.js', async (_, reply) => {
    const js = fs.readFileSync(path.join(__dirname, '../views/dashboard-client.txt'), 'utf8');
    reply
      .header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .type('application/javascript')
      .send(js);
  });

  fastify.get('/v1/dashboard/firebase-config', async () => ({
    success: true,
    data: firebaseConfig,
  }));
}

module.exports = dashboardRoutes;
