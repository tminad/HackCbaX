# Run the Gemini macro layer now

The financial core remains deterministic. Gemini only produces a bounded macro signal.

## 1. Keep the secret local

At the repository root, your local `.env` should contain:

```env
GEMINI_API_KEY=YOUR_REAL_KEY
GEMINI_MODEL=gemini-3.6-flash
```

Never commit `.env`. `.env.example` is safe to commit.

## 2. Install dependencies (only if needed)

```bash
npm install
```

## 3. Collect the historical macro corpus

```bash
npm run macro:collect
```

This retrieves/validates the historical Argentina/Brazil macro releases used by the replay and writes `data/macro/sources/collected-releases.json`.

## 4. Verify the real Gemini API

```bash
npm run macro:gemini-smoke
```

Expected success message:

```text
Gemini smoke PASSED: gemini-3.6-flash; live API response validated.
```

The smoke test uses a real September 6 ARS macro pack and structured JSON validation.

## 5. Generate the AI-assisted historical checkpoints

```bash
npm run macro:historical
```

It analyzes:

- 2026-09-06 00:00 UTC
- 2026-09-12 10:00 UTC
- 2026-09-12 11:00 UTC

The September 12 11:00 checkpoint reuses the previous macro pack when no new evidence exists, allowing the cache to be exercised instead of making an unnecessary model call.

Outputs:

```text
data/macro/historical/signals.json
data/macro/historical/ai-assisted-replay.json
docs/MACRO_INTELLIGENCE_REPORT.md
```

## 6. Validate the project

```bash
npm test
npm run typecheck
npm run build
```

## What Gemini is allowed to do

Gemini interprets point-in-time macro evidence and returns a `macroScore` and `confidence`. Its maximum effect is:

```text
AI adjustment = macroScore × confidence × 0.50%
```

Gemini does not see Morpho rankings, does not calculate Net Carry, does not see Curve switching costs, and cannot decide BUY/HOLD/REBALANCE. The existing deterministic financial engine remains the decision maker.
