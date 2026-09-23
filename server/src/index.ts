import { config } from './config';
import { buildApp } from './app';

const app = buildApp();

app.listen(config.port, () => {
  console.log(`EnhanceCV server listening on http://localhost:${config.port}`);
});
