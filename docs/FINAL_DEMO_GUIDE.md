# Carry Autopilot — final demo flow

## Mode 1: Historical AI Replay (real evidence)

1. Open the app and choose **RUN HISTORICAL AI REPLAY**.
2. Start at **06 Sep 00:00 UTC**.
   - Yield-only ranking says ARGt looks best.
   - Published FX expectations + bounded Gemini signals make both local carries negative.
   - Defensive USDC benchmark is 0.00%.
   - Decision: **STAY IN USDC**.
3. Advance to **12 Sep 10:00 UTC**.
   - BRAt becomes the yield-only leader.
   - BRL uses a validated cached Gemini signal.
   - ARS shows **SAFE FALLBACK** because the Gemini signal was unavailable; the engine uses the published quantitative FX baseline and a 0% AI adjustment.
   - Decision remains **HOLD USDC**.
4. Advance to **12 Sep 11:00 UTC**.
   - ARGt becomes the yield-only leader again.
   - Macro evidence did not change, so BRL reuses the cached signal.
   - Decision remains **HOLD USDC**.

Message for the jury: **the agent does not chase rates and it is allowed to do nothing.**

## Mode 2: Demo Mode (full lifecycle)

Use the original demo to show the autonomous execution lifecycle:

1. Start Autopilot with the default simulated deposit.
2. Let the scanner choose the initial strategy using the deterministic core.
3. Click **Test a small improvement** to show a HOLD after switching costs.
4. Click **SIMULATE MARKET CHANGE** to show the stronger opportunity and animated REBALANCE.

This mode is explicitly simulated and exists to demonstrate the full execution UX quickly.

## Safety / truthfulness

- Historical market/macro evidence is real and point-in-time constrained.
- Saved Gemini signals came from a validated live Gemini 3.6 Flash run and are replayed from cache in the browser.
- Gemini never calculates Net Carry or decides BUY/SELL/HOLD directly.
- AI adjustment is bounded to ±0.50% over 30 days.
- Curve historical execution costs remain modeled.
- USDC historical defensive benchmark assumes 0% carry; no USDC yield is fabricated.
- No claim is made that the historical replay executed real blockchain transactions.
