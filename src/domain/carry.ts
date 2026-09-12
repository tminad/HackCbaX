import { DEFAULT_RISK_FACTOR, HORIZON_DAYS } from "./constants.js";
import type { CarryInputs, CarryResult, YieldInputs } from "./types.js";
import { finite, nonNegative } from "./validation.js";

export function effectiveApr(input: YieldInputs): number {
  finite("baseApr", input.baseApr);
  nonNegative("incentiveApr", input.incentiveApr);
  nonNegative("incentiveDaysLeft", input.incentiveDaysLeft);
  const persistence = Math.min(1, input.incentiveDaysLeft / HORIZON_DAYS);
  return finite("effectiveApr", input.baseApr + input.incentiveApr * persistence);
}

export function netCarry30d(
  input: CarryInputs,
  riskFactor = DEFAULT_RISK_FACTOR,
): CarryResult {
  const apr = effectiveApr(input);
  finite("expectedFxReturn30d", input.expectedFxReturn30d);
  nonNegative("fxVolatility30d", input.fxVolatility30d);
  nonNegative("riskFactor", riskFactor);
  const yield30d = finite("yield30d", apr * HORIZON_DAYS / 365);
  const riskBuffer = finite("riskBuffer", input.fxVolatility30d * riskFactor);
  return {
    effectiveApr: apr,
    yield30d,
    riskBuffer,
    netCarry30d: finite("netCarry30d", yield30d + input.expectedFxReturn30d - riskBuffer),
  };
}
