const fs = require('fs');
const path = require('path');

const docsHtml = fs.readFileSync(
  path.join(__dirname, '../views/docs.html'),
  'utf8',
);

async function docsRoutes(fastify) {
  fastify.get('/docs', async (_, reply) => {
    reply.type('text/html').send(docsHtml);
  });
}

module.exports = docsRoutes;
