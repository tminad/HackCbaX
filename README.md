# LATAM carry financial core

The initial repository contained only `AGENTS.md` and `MVP_SPEC.md` (at the root, not `docs/MVP_SPEC.md`). The financial core remains a standalone TypeScript library with no runtime dependencies. A React 19 + Vite 6 frontend now provides a simulated autonomous wallet. Requires Node 20+ and npm; Vite 6 was chosen to support the existing Node 20.17 environment.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. For validation:

```sh
npm test
npm run typecheck
npm run build
npm run test:ui
npm run demo
```

`src/domain` contains pure financial calculations, types, execution eligibility and decisions. `src/fixtures` contains synthetic USDC, ARGt and BRAt opportunities. `tests` uses Node's built-in test runner against compiled code. `scripts/demo.mjs` prints comparisons and the two decisions. `dist` is generated library output; `web-dist` is the independent frontend production build.

## Agreed formulas

All rates are decimal fractions; calculations remain unrounded. Yield comes from the external strategy, not the token.

- `persistence = min(1, incentiveDaysLeft / 30)`
- `effectiveApr = baseApr + incentiveApr * persistence`
- `yield30d = effectiveApr * 30 / 365`
- `riskBuffer = fxVolatility30d * riskFactor`, default `0.25`
- `netCarry30d = yield30d + expectedFxReturn30d - riskBuffer`
- `switchCost = gasCostPct + swapFeesPct + slippagePct + otherExecutionFeesPct`
- `carryImprovement = target.netCarry30d - current.netCarry30d`
- `netBenefit = carryImprovement - switchCost`
- Normal rebalance requires `netBenefit >= 0.002`, all eligibility gates, a different asset, and an expired 12-hour cooldown.
- `breakEvenDays = switchCost / annualCarryDifference * 365`; decision explanations annualize the complete carry advantage as `carryImprovement * 365 / 30`.

`netCarry30d()` returns the APR/yield/risk/carry breakdown. `checkEligibility()` is separate because eligibility depends on position size and the execution route. Call it before ranking a candidate; `shouldRebalance()` always rechecks it and recomputes both carries. It evaluates a supplied target, not a portfolio or ranking service.

## Explicit assumptions

- Emergency means `current.criticalRisk` or an explicit external emergency flag. A safe exit to USDC bypasses both cooldown and the profit threshold, including when expected carry falls. This interprets the specification's defensive exit intent; the normal formula is unchanged. Emergency exits do **not** bypass withdrawal, deposit, route safety, whitelist, liquidity or slippage gates. If blocked, the result is HOLD with reasons; the caller can display that emergency execution is blocked.
- The caller supplies epoch milliseconds and the last **non-emergency** rebalance timestamp. Null means no previous normal rebalance. Future timestamps are rejected. Exactly 12 hours is eligible.
- Liquidity, withdrawal capacity and position size are supplied in USD equivalents. Capacity must cover the full requested amount. This is deliberately conservative about costs reducing the eventual deposit. No partial allocation or live quote estimation is implemented.
- The explicit target-yield-protocol whitelist is `Morpho`. Fixture vaults and route evidence are synthetic, not claims of live market availability. Route safety is caller-provided evidence; no protocol integration exists yet.
- Cost inputs are already percentages of the position, supplied by a future estimator/adapter. Slippage uses one shared input for cost and eligibility. Exactly 0.005 is accepted.
- Invalid/non-finite numbers throw `RangeError`; unavailable capabilities return ineligibility reasons. Negative incentive days, incentives, volatility, costs, risk factors and capacities are rejected, not silently clamped. Signed base APR and expected FX are allowed. External untrusted JSON still requires schema validation at its future adapter boundary.
- No positive annual carry advantage returns `null` for break-even; zero cost with positive advantage returns zero days.
- IEEE-754 `number` arithmetic is used for this MVP. Only the inclusive benefit comparison absorbs a few machine-precision units of subtraction noise (8 × epsilon × operand scale); it does not round display percentages or change the financial margin. Tests cover just below, exactly at and just above the threshold. This is not transaction amount accounting.

## Fixtures

The example in section 8 is calculated from full precision inputs. BRAt carry is approximately 0.586301%; ARGt is 0.697260%. Moving costs 0.15%, giving a net benefit of -0.039041%: HOLD. Updating only ARGt expected FX from -0.45% to -0.05% makes its carry approximately 1.097260% and net benefit +0.360959%: REBALANCE.

All returns are hypothetical estimates, subject to market conditions.

## Opportunity scanner and initial allocation

`src/services/opportunityScanner.ts` exposes two pure synchronous functions:

- `scanOpportunities({ candidates, depositAmountUsd, riskFactor? })` checks entry eligibility before calculating carry and ranking eligible candidates.
- `selectBestStrategy(request)` returns that complete scan plus `selected` (or `null`), a reason code and a deterministic explanation. It is for a new USDC deposit, not an existing invested position.

Each candidate supplies a stable unique `id`, a `StrategySnapshot`, and a `DeploymentRoute` quoted for the requested deposit size. The route covers either a swap into ARGt/BRAt or direct USDC vault deployment. Initial allocation requires no withdrawal evidence. `checkDeploymentEligibility()` owns common entry gates; existing `checkEligibility()` adds withdrawal checks for rebalance. Net Carry and ShouldRebalance formulas remain unchanged.

The result includes original snapshot inputs, route evidence, effective APR, 30-day yield, risk buffer, unrounded Net Carry, rank, applied risk factor and horizon. Excluded candidates have code/message reasons and `calculation: null`; they are never ranked. Invalid numeric evidence throws as in the domain core; future adapters must validate untrusted data before scanning.

Ranking is descending by full-precision Net Carry. Exact ties use USDC, ARGt, BRAt, then stable candidate ID in code-unit order. This is an explicit tie policy, not a risk penalty. Duplicate or blank IDs are rejected. Exclusions are sorted by ID. No eligible candidates means no allocation, including when USDC is unavailable. There is no extra positive-return hurdle: even if all eligible carries are negative, selection returns the highest one, as requested. No switching costs, cooldown, or rebalance safety margin apply.

### Future adapter contract: APR, not APY

Future Morpho/Curve/FX adapters must produce the same candidate inputs; they do not change domain calculations. They must validate and normalize external rates into **annualized APR decimal fractions**, separating base APR and incentives, before invoking the scanner. An externally reported APY must not be passed directly as APR. Its normalization must account for the source's documented compounding convention; no universal APY conversion is assumed here. Adapters must also normalize FX to 30-day USD-relative returns/volatility and capacities to USD equivalents. Data fetching, freshness checks, and quote construction belong outside these pure services. No live adapter or AI integration is included.

`src/fixtures/initialAllocation.ts` provides a separate initial market: ARGt nominal/effective APR is 17%, but expected FX is -0.85% and its risk buffer is 0.25%, giving approximately 0.297260% carry. BRAt's 12% APR gives approximately 0.586301% carry, beating both ARGt and USDC (0.410959%). `npm run demo` prints this initial selection followed by the existing HOLD/REBALANCE examples.

`npm test` explicitly runs the domain, opportunity scanner, demo orchestration and historical test files, avoiding shell glob expansion on Windows. All original 85 financial tests remain unchanged.

## Visual wallet demo

The single-screen frontend lives in `src/ui`. It displays a deposit form, gradually revealed opportunity cards, the selected strategy, execution progress, structured decision evidence and a chronological activity feed. Country marks and orbit graphics are local CSS shapes; no external images or fonts are needed. Reduced-motion preferences are respected.

`src/application/demoEngine.ts` owns a pure reducer with explicit timestamped events. React's `useDemo` only schedules ticks and cancels timers on reset/unmount. Stages are:

```text
IDLE -> SCANNING -> SELECTED -> DEPLOYING -> ACTIVE
ACTIVE/HOLDING -> MARKET_CHANGE -> ANALYZING_REBALANCE
  -> HOLDING, or REBALANCING -> ACTIVE
```

No eligible initial candidate enters `BLOCKED`, with exclusions visible and no execution. Invalid input shows an error. Busy stages reject concurrent start/market events. Reset clears the session. There is no persistence across reloads.

The reducer calls `selectBestStrategy()` using snapshots from `mockMarket.ts`. It calls `netCarry30d()` for the current position and `shouldRebalance()` for existing-position moves. UI components format results and render evidence; they do not implement financial formulas. Template explanations reference the actual winner and comparisons. A position is committed only when its simulated execution plan completes. Normal rebalance completion records the cooldown timestamp; market injection never bypasses the financial core's cooldown.

### Presenting the demo

1. Keep the default 1,000 USDC and press **Start autopilot**. The scan and automatic deployment take about eight seconds. Brazil wins on carry despite Argentina's 17% APR.
2. In **Demo Mode / Presenter controls**, press **Test a small improvement**. The existing HOLD fixture produces about +0.111% improvement, -0.150% cost and -0.039% net benefit. Capital stays in BRAt.
3. Press **Simulate market change**. The existing stronger fixture produces about +0.361% net benefit and an 8.8-day break-even. Six execution steps animate automatically and the current position becomes ARGt.
4. Use **Reset demo** to replay. Repeated market injection evaluates the actual current asset, so it does not force another rebalance.

The principal is the entered simulated deposit, not a fabricated live portfolio valuation. Market returns, yield accrual and execution debits are not applied to that display. Cost percentages are fixture estimates regardless of amount. Route liquidity is mocked at the fixture capacity; a deposit above that capacity demonstrates exclusions. Withdrawal evidence represents the complete simulated position, not a real vault quote.

**Real:** approved financial formulas, eligibility checks, scanner rankings, rebalance decisions and cooldown. **Simulated:** deposited funds, market snapshots/events, withdrawal/deposit/swap execution and protocol routes. Protocol names in the expandable technical layer describe the intended integration path, not existing connections. There are no wallets, onchain transactions, APIs or LLMs connected. There are no fake transaction hashes.

### Builds and browser checks

- `npm run build:core`: compile reusable library and orchestration into `dist`.
- `npm run build:ui`: typecheck UI and build Vite into `web-dist`.
- `npm run build`: both builds.
- `npm run typecheck`: core and UI types.
- `npm run test:ui`: three Playwright browser flows, using locally installed Chrome in headless mode. The command starts and stops its own Vite server. Chrome must be installed; no browser download occurs during normal tests. Screenshots are written to ignored `test-results`.
- `npm run preview`: serve the built frontend locally after `npm run build`.

The next smallest integration step is a read-only normalized market-data adapter for one strategy, with fixture fallback and visible source/freshness labels. Execution can stay simulated while that adapter is verified. External rate normalization must continue to provide APR, not APY.

## Historical data foundation

The historical CLI is separate from the approved mock UI. Public read-only adapters now collect Morpho, Merkl, official fiat FX and Curve evidence; the wallet demo still uses its existing fixtures. No transaction execution or AI integration has been added.

```sh
npm run historical:discover   # public network reads; refresh compact source observations
npm run historical:analyze    # offline: generate normalized JSON/CSV, replays and report
```

The saved artifacts in `data/historical` allow analysis without live APIs. Refreshing discovery may change the available window and provider-revised history. `discovery.json` records exact endpoints, bounds, contracts, current quote calibration and source IDs; `source-history.json` contains normalized source observations instead of large raw API dumps.

`src/adapters` owns retrieval and APR/APY normalization. `src/historical` owns past-only alignment, trailing FX volatility, explicit execution-cost models and replay orchestration. It calls the existing scanner and financial core. Forecast FX stays **NEUTRAL FX BASELINE — PRE-AI** (`expectedFxReturn30d=0`). Missing historical fields stay missing.

`replay-base.json` and `replay-stress.json` are $1,000 **exploratory** runs with modeled execution availability/costs. `replay-strict.json` requires actual historical eligibility evidence and fails closed. Additional `replay-100-base.json` / `replay-100-stress.json` use separately measured current quotes at $100 for size sensitivity. None of these files claims real transaction execution or realized portfolio P&L. Cost models expose individual fees, slippage, gas and other costs; current calibration projected backward is explicitly modeled, not historical fact.

See [HISTORICAL_DATA_REPORT.md](docs/HISTORICAL_DATA_REPORT.md) for verified windows, addresses, yield ranges, BASE/STRESS results and limitations. The report is generated by analysis so its figures remain synchronized with the saved dataset. Historical unit tests are deterministic and never call live APIs.
