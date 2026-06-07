This folder is reserved for optional, fully local ML models used by CCE‑lite.

- Current build uses fast rule-based labeling only, no model loaded by default.
- When you choose to ship a tiny TF.js classifier, place model.json and shard files here, and lazy-load them only on-demand from the Analyze tab.
- Keep model sizes minimal (quantized). Target < 5–10 MB total and ensure no remote fetches.
