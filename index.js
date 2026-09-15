import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Placeholder shape — replace with a real database query keyed off the
// authenticated driver's ID. Field names must stay the same since the
// frontend reads this exact shape.
const driver = {
  id: '',
  name: '',
  dateJoined: '',
  sponsorName: '',
  points: 0,
  recentPurchases: [],
};

app.get('/api/driver', (req, res) => {
  res.json(driver);
});

app.listen(PORT, () => {
  console.log(`Driver dashboard API running on http://localhost:${PORT}`);
});