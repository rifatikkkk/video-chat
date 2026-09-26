import { createAppServer } from './app.js';
import { loadServerConfig } from './config.js';

const config = loadServerConfig();
const { server } = createAppServer({ publicOrigin: config.publicOrigins });

server.listen(config.port, () => {
  console.log(`Video Chat server listening on http://localhost:${config.port}`);
});
