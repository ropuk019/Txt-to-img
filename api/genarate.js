import { fal } from "@fal-ai/client";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Only POST allowed" });
  }

  try {
    const { prompt, width = 1024, height = 1024 } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ ok: false, error: "Missing 'prompt' string" });
    }

    // Configure Fal.ai client with your API key from env
    fal.config({ credentials: process.env.FAL_API_KEY });

    // Submit the generation request (using the FLUX.1 dev model)
    const modelId = "fal-ai/flux/dev";
    const result = await fal.subscribe(modelId, {
      input: { prompt, width, height, num_outputs: 1 }
    });

    // Try to extract the image URL from the result
    const imageUrl =
      result?.data?.images?.[0]?.url ||
      result?.data?.output?.[0]?.url ||
      result?.data?.[0]?.url ||
      null;

    if (!imageUrl) {
      return res.status(500).json({ ok: false, error: "No image URL found", raw: result });
    }

    return res.status(200).json({ ok: true, url: imageUrl });
  } catch (err) {
    console.error("Generation error:", err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}
