import { createAppServer } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const { server } = createAppServer();

server.listen(port, () => {
  console.log(`Video Chat server listening on http://localhost:${port}`);
});
