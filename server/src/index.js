import { createAppServer, createReadinessState } from './app.js';
import { loadServerConfig } from './config.js';
import { ShutdownController, installShutdownHandlers } from './shutdown/ShutdownController.js';

const config = loadServerConfig();
const readiness = createReadinessState();
const instance = createAppServer({ publicOrigin: config.publicOrigins, readiness });
const { io, server } = instance;
const shutdownController = new ShutdownController({
  io,
  server,
  readiness,
  graceMs: config.shutdownGraceMs,
});

installShutdownHandlers({ controller: shutdownController });

server.listen(config.port, () => {
  console.log(`Video Chat server listening on http://localhost:${config.port}`);
});
