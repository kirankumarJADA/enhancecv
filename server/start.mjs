import init from './dist/index.js';
const app = init();
const port = process.env.PORT || 4001;
app.listen(port, () => {
  console.log(`EnhanceCV server listening on http://localhost:${port}`);
});