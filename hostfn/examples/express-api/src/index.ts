import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Express API!' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
