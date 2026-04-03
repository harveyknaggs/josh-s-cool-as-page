const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.static('.'));

const client = new Anthropic();

app.post('/api/extract', async (req, res) => {
  const { image } = req.body;
  if (!image) return res.status(400).json({ error: 'No image provided' });

  // Parse data URL: "data:image/jpeg;base64,/9j/4AAQ..."
  const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return res.status(400).json({ error: 'Invalid image format' });

  const mediaType = match[1];
  const base64Data = match[2];

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data
            }
          },
          {
            type: 'text',
            text: 'Read this whiteboard photo. List every job, address, or item you can see, one per line. Include any section headers (like "Landscaping Jobs", "Gardening Jobs", "Maintenance" etc). Return only the text you can read, no numbering, no bullet points, no extra commentary.'
          }
        ]
      }]
    });

    const text = response.content[0].text;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    res.json({ lines });
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to extract text' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('WARNING: ANTHROPIC_API_KEY not set. OCR extraction will fail.');
  }
});
