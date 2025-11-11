require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { fal } = require('@fal-ai/client'); // from Fal.ai docs
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const FAL_API_KEY = process.env.FAL_API_KEY;
if (!FAL_API_KEY) {
  console.error('Missing FAL_API_KEY in .env');
  process.exit(1);
}

// initialize client (per Fal.ai docs)
const client = fal({
  apiKey: FAL_API_KEY
});

// Spawn a generation request and poll for result (pattern from Fal.ai docs)
async function generateWithFlux(prompt, options = {}) {
  // choose model id per provider; this follows Fal.ai examples from docs
  const modelId = options.modelId || 'fal-ai/flux/dev'; // example identifier; replace if your provider docs differ
  const payload = {
    input: {
      prompt,
      width: options.width || 1024,
      height: options.height || 1024,
      num_outputs: options.num_outputs || 1,
      // add any other provider-specific params here (seed, guidance, style, etc.)
    },
    webhookUrl: options.webhookUrl || null
  };

  // submit
  const submitRes = await client.queue.submit(modelId, payload);
  const requestId = submitRes.request_id || submitRes.requestId || submitRes.id;
  if (!requestId) throw new Error('Failed to create generation request');

  // Poll until done (with backoff)
  for (let i = 0; i < 60; i++) { // timeout after ~60 polls (~5 minutes depending on interval)
    await new Promise(r => setTimeout(r, 2000)); // 2s interval
    const status = await client.queue.status(modelId, { requestId });
    // structure depends on provider; adjust as needed
    if (status && status.state && (status.state === 'completed' || status.state === 'succeeded')) {
      // result location(s)
      const outputs = status?.result?.data || status?.result || status?.data || status.outputs;
      // attempt to find an image URL
      const candidate = (Array.isArray(outputs) ? outputs[0] : outputs);
      if (!candidate) throw new Error('No outputs found');
      // the exact shape may vary. Try common fields:
      const imageUrl = candidate.url || candidate.output?.[0]?.url || candidate.output || candidate.image_url || candidate[0]?.url;
      return { requestId, imageUrl, raw: status };
    }
    if (status && status.state && (status.state === 'failed' || status.state === 'error')) {
      throw new Error('Generation failed: ' + JSON.stringify(status));
    }
    // else continue polling
  }

  throw new Error('Timed out waiting for generation result');
}

app.post('/api/generate', async (req, res) => {
  const { prompt, width, height, model } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ ok: false, error: 'prompt (string) is required' });
  }

  try {
    const result = await generateWithFlux(prompt, {
      width: width || 1024,
      height: height || 1024,
      modelId: model || 'fal-ai/flux/dev'
    });

    if (!result.imageUrl) {
      // If provider returns base64 or data, you may need to upload to a hosting (e.g., S3) and return that URL.
      return res.status(200).json({ ok: true, note: 'No direct URL returned; see raw provider output', raw: result.raw });
    }

    return res.json({ ok: true, url: result.imageUrl, requestId: result.requestId });
  } catch (err) {
    console.error('Generation error', err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.get('/', (req, res) => res.send('AI Image API is running'));

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
