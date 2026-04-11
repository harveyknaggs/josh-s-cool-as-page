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

app.post('/api/daily-plan', async (req, res) => {
  const { date, crew, jobs, weather, rules, examples } = req.body;

  if (!Array.isArray(crew) || !Array.isArray(jobs)) {
    return res.status(400).json({ error: 'crew and jobs must be arrays' });
  }

  const crewText = crew.length === 0 ? '(no crew available)' : crew.map(c => {
    const parts = [];
    if (c.role) parts.push(c.role);
    if (c.strengths) parts.push(c.strengths);
    if (c.tools) parts.push('tools: ' + c.tools);
    if (c.truck) parts.push('truck: ' + c.truck);
    parts.push(c.canDrive ? 'drives' : 'no licence');
    return `- ${c.name} — ${parts.join('; ')}`;
  }).join('\n');

  const jobsText = jobs.length === 0 ? '(no jobs scheduled today)' : jobs.map((j, i) => {
    const bits = [`${i + 1}. "${j.name}"`];
    if (j.category) bits.push(`(${j.category}`);
    if (j.hours) bits.push(`${j.hours}hrs)`);
    else if (j.category) bits[bits.length - 1] += ')';
    let line = bits.join(' ');
    if (j.coords) line += ` — coords: ${j.coords.lat.toFixed(4)}, ${j.coords.lng.toFixed(4)}`;
    if (j.description) line += `\n   Notes: ${j.description}`;
    return line;
  }).join('\n');

  const weatherText = weather
    ? `${weather.summary || 'Unknown'}, ${weather.tempMin}-${weather.tempMax}°C, ${weather.rainChance}% rain chance`
    : 'Weather data unavailable';

  const rulesSection = (rules && rules.trim())
    ? `\n\nIMPORTANT RULES FROM JOSH (always follow these):\n${rules.trim()}`
    : '';

  const examplesSection = (Array.isArray(examples) && examples.length > 0)
    ? `\n\nEXAMPLES OF PAST PLANS JOSH LIKED (match this tone and style):\n` +
      examples.slice(-5).map((ex, i) => `--- Example ${i + 1} ---\n${ex}`).join('\n\n')
    : '';

  const userPrompt = `You are helping Josh, a landscaping manager in Christchurch NZ, plan the crew's day. Write a concise daily overview (1-2 paragraphs) that will be shared with the team via Messenger.${rulesSection}${examplesSection}

TODAY: ${date}

WEATHER: ${weatherText}

CREW AVAILABLE:
${crewText}

TODAY'S JOBS:
${jobsText}

Write a short, casual plan:
- Group geographically close jobs together (use coordinates when available)
- Assign crew based on strengths (hard landscaping -> Vili/Will, gardening -> Sam, complex -> Paul)
- Make sure every team going to a job has at least one driver
- Mention weather if it affects the work (rain -> reschedule outdoor prep, heat -> hydration)
- Be practical and direct. Don't use bullet points, just flowing prose like Josh would write for his team on Messenger. Keep it under 200 words.
- Follow Josh's rules above strictly if any were given, and match the tone of his past plans if examples were given.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userPrompt }]
    });
    const suggestion = response.content[0].text.trim();
    res.json({ suggestion });
  } catch (err) {
    console.error('Claude daily-plan error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate plan' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('WARNING: ANTHROPIC_API_KEY not set. OCR extraction will fail.');
  }
});
