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
            text: 'Read this whiteboard photo. The BLUE text represents category headers and the GREEN text represents job addresses/items. Each green item belongs to the blue header directly above it on the whiteboard. Organize the jobs into these 5 categories: "Pre-Sale Maintenance", "Pre-Sale Tidys", "Landscaping Jobs", "Gardening Jobs", "Maintenance". Return ONLY a JSON object where each key is a category name and each value is an array of the green job addresses listed under that blue heading. If a category has no items, use an empty array. Example: {"Pre-Sale Maintenance": ["23 eastream", "12a bevin"], "Pre-Sale Tidys": ["1 totara"], "Landscaping Jobs": [], "Gardening Jobs": [], "Maintenance": []}. Return only valid JSON, nothing else.'
          }
        ]
      }]
    });

    const text = response.content[0].text;

    // Try to parse as JSON categories
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const categories = JSON.parse(jsonMatch[0]);
        return res.json({ categories });
      }
    } catch (parseErr) {
      console.error('JSON parse failed, falling back to lines:', parseErr.message);
    }

    // Fallback: return as flat lines
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
