import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import compression from 'compression';
import helmet from 'helmet';

const app = express();
const PORT: number = parseInt(process.env.PORT || '3000', 10);

app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/contact', (req: Request, res: Response) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    res.status(400).json({ error: 'All fields are required' });
    return;
  }
  console.log('');
  console.log('===== NEW MESSAGE =====');
  console.log('From:', name);
  console.log('Email:', email);
  console.log('Message:', message);
  console.log('=======================');
  console.log('');
  res.json({ success: true, message: 'Thank you! Message received.' });
});

app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('');
  console.log('=================================');
  console.log('  ELVIN JHON Portfolio Server');
  console.log('  http://localhost:' + PORT);
  console.log('=================================');
  console.log('');
});