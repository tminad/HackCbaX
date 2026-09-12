# Macro Intelligence Report

Generated from the validated Gemini replay captured on 2026-09-12. No additional model call was required for the defensive-USDC post-processing.

## Architecture

Gemini receives only point-in-time macro evidence. It returns a bounded MacroSignal; deterministic code composes the signal with a published FX baseline, and the approved financial core calculates Net Carry. A defensive USDC cash benchmark at 0% Net Carry is evaluated after the local carry calculations so the agent is never forced into a negative expected carry trade. Gemini never sees Morpho ranking or Curve costs.

## Guardrails

- Every historical evidence item must have publishedAt <= asOf.
- AI adjustment = macroScore × confidence × 0.50%; absolute contribution is capped by construction at 0.50% over 30 days.
- Monthly REM/Focus forecasts are used only as a labeled horizon approximation; no fake interpolation.
- Gemini/API failure produces zero AI adjustment, never a fabricated signal.
- USDC defensive cash assumes 0% yield; no USDC yield is fabricated.
- Historical execution remains a $100 exploratory diagnostic with modeled Curve execution costs.

## Gemini runtime

Configured model: **gemini-3.6-flash**. The signals below are the validated saved outputs from the live run; cached/fallback status is preserved.

## 2026-09-06T00:00:00.000Z

Action: **STAY_USDC** — DEFENSIVE_USDC_BEST

PRE-AI winner: **ARGt**  
AI-assisted winner (including defensive cash): **USDC**

Defensive USDC benchmark: **0.000% Net Carry**

### ARGt / ARS

- AI status: cached
- Macro score / confidence: -0.300 / 0.750
- Base FX: -3.834%
- AI adjustment: -0.112%
- Final expected FX: -3.946%
- PRE-AI Net Carry: 0.679%
- AI-assisted Net Carry: -3.267%

### BRAt / BRL

- AI status: cached
- Macro score / confidence: 0.450 / 0.800
- Base FX: -1.704%
- AI adjustment: 0.180%
- Final expected FX: -1.524%
- PRE-AI Net Carry: 0.313%
- AI-assisted Net Carry: -1.211%

## 2026-09-12T10:00:00.000Z

Action: **HOLD** — DEFENSIVE_USDC_BEST

PRE-AI winner: **BRAt**  
AI-assisted winner (including defensive cash): **USDC**

Defensive USDC benchmark: **0.000% Net Carry**

### ARGt / ARS

- AI status: unavailable
- Macro score / confidence: MISSING
- Base FX: -3.514%
- AI adjustment: 0.000%
- Final expected FX: -3.514%
- PRE-AI Net Carry: 0.430%
- AI-assisted Net Carry: -3.084%

### BRAt / BRL

- AI status: cached
- Macro score / confidence: 0.450 / 0.850
- Base FX: -1.715%
- AI adjustment: 0.191%
- Final expected FX: -1.524%
- PRE-AI Net Carry: 0.757%
- AI-assisted Net Carry: -0.767%

## 2026-09-12T11:00:00.000Z

Action: **HOLD** — DEFENSIVE_USDC_BEST

PRE-AI winner: **ARGt**  
AI-assisted winner (including defensive cash): **USDC**

Defensive USDC benchmark: **0.000% Net Carry**

### ARGt / ARS

- AI status: unavailable
- Macro score / confidence: MISSING
- Base FX: -3.514%
- AI adjustment: 0.000%
- Final expected FX: -3.514%
- PRE-AI Net Carry: 0.428%
- AI-assisted Net Carry: -3.086%

### BRAt / BRL

- AI status: cached
- Macro score / confidence: 0.450 / 0.850
- Base FX: -1.715%
- AI adjustment: 0.191%
- Final expected FX: -1.524%
- PRE-AI Net Carry: 0.318%
- AI-assisted Net Carry: -1.206%

## Limitations

This is not a point-in-time audited trading backtest. Macro corpus is curated rather than exhaustive; monthly survey forecasts are approximations to a 30-day horizon; fiat FX is a proxy for Twin-token FX; Curve execution costs remain modeled; the historical USDC execution route/yield strategy is not claimed; and Gemini pretraining knowledge leakage cannot be mathematically proven absent even though the prompt forbids outside/future knowledge.
