import { createServer } from 'vite';

const port = Number(process.argv[2]) || 4184;
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  base: '/',
  server: { host: '127.0.0.1', port, strictPort: true },
});
await server.listen();
console.log(`ready http://127.0.0.1:${port}`);
