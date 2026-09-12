# AGENTS.md — Autonomous LATAM Carry Agent

## Mission

Build an MVP for a hackathon at Naranja X.

The product is an autonomous LATAM carry-trade agent.

Core promise:

> The user deposits once. The system decides where the capital should be allocated, deploys it, monitors the opportunity, and rebalances automatically when moving is economically justified.

The product must NOT be a generic chatbot or a dashboard with AI attached to it.
AI/automation must be part of the core decision flow.

## Hackathon constraints

Prioritize:
1. A working live demo.
2. A clear real-world problem.
3. A small number of features executed extremely well.
4. A visible "wow" moment.
5. Real onchain interaction where feasible.
6. Autonomous execution: no human approval in the middle of normal rebalancing.

Avoid:
- feature creep
- unnecessary CRUD
- authentication unless strictly needed
- admin panels
- complex multi-agent theater
- leverage in the MVP
- flash loans in the MVP
- supporting 7 currencies before ARGt/BRAt/USDC works end-to-end

## MVP assets / strategies

Start with only three strategies:

1. USDC — defensive / risk-off base asset
2. ARGt — Argentina exposure
3. BRAt — Brazil exposure

Initial execution target:
- Arbitrum
- Twin stablecoins for ARGt / BRAt
- Curve (or the available compatible swap route) for swaps
- Morpho vaults for yield

Important conceptual separation:
- Twin = local-currency stablecoins
- Arbitrum = blockchain/network where the operations run
- Curve = swap / FX venue
- Morpho = yield/lending vault
- Our system = intelligence, risk calculation, decision and orchestration

Never assume a token itself generates yield.
Yield comes from the external strategy/protocol in which the token is deposited.

## Core financial model

Use a 30-day comparison horizon.

Constants for MVP:

```ts
HORIZON_DAYS = 30
DEFAULT_RISK_FACTOR = 0.25
SAFETY_MARGIN = 0.002       // 0.20%
MAX_SLIPPAGE = 0.005        // 0.50%
COOLDOWN_HOURS = 12
```

### Effective APR

Separate organic/base yield from temporary incentives.

```text
persistence =
  min(1, incentiveDaysLeft / HORIZON_DAYS)

effectiveAPR =
  baseAPR + incentiveAPR * persistence
```

If there is no incentive, incentiveAPR = 0.

### 30-day expected yield

```text
yield30d =
  effectiveAPR * HORIZON_DAYS / 365
```

All rates are represented as decimals internally:
- 12% => 0.12
- 0.5% => 0.005

### Risk buffer

```text
riskBuffer =
  fxVolatility30d * riskFactor
```

Default balanced risk factor = 0.25.

Risk factor may later vary by profile:
- aggressive: 0.10
- balanced: 0.25
- conservative: 0.50

### Net Carry

```text
netCarry30d =
  yield30d
  + expectedFxReturn30d
  - riskBuffer
```

Interpretation:

> If capital remains in this strategy for roughly the next 30 days, what return do we expect after considering yield, expected currency movement, and an uncertainty penalty?

Expected FX return is measured against USDC/USD:
- positive => local currency expected to appreciate versus USD
- negative => local currency expected to depreciate versus USD
- USDC => approximately 0 for MVP

Do NOT put swap fees or switching costs inside Net Carry.
Net Carry compares strategies independently.
Execution costs belong in ShouldRebalance.

## Eligibility filters

Before ranking a strategy, verify it is eligible.

A strategy is ineligible if any critical condition fails, for example:
- swap route unavailable
- vault deposit unavailable
- current position cannot be withdrawn sufficiently
- estimated slippage > MAX_SLIPPAGE
- protocol is not whitelisted
- critical protocol / stablecoin alert
- insufficient liquidity for the requested position size

Liquidity is a gate, not an arbitrary score penalty.

For MVP, use an explicit whitelist for accepted protocols rather than inventing numerical "protocol risk scores".

## ShouldRebalance

First calculate:

```text
carryImprovement =
  target.netCarry30d - current.netCarry30d

netRebalanceBenefit =
  carryImprovement - switchCost
```

Where:

```text
switchCost =
  gasCostPct
  + swapFeesPct
  + slippagePct
  + otherExecutionFeesPct
```

Rebalance only when:

```text
netRebalanceBenefit >= SAFETY_MARGIN
```

AND all execution conditions pass:
- current position can be withdrawn
- target can be deposited
- swap route exists
- slippage <= MAX_SLIPPAGE
- target is eligible
- cooldown has expired

Normal cooldown:
- 12 hours after a non-emergency rebalance

Emergency exits ignore cooldown.

Examples of emergency exit conditions:
- stablecoin depeg alert
- protocol exploit / critical alert
- liquidity crisis
- execution route becomes unsafe
- other explicit critical-risk flag

Default defensive destination for emergency/risk-off mode:
- USDC

## Break-even calculation

Expose break-even time to explain decisions.

For positive annualized carry advantage:

```text
breakEvenDays =
  switchCost / annualCarryDifference * 365
```

Use this primarily as an explanation/UI metric, not as a replacement for ShouldRebalance.

## AI responsibilities

AI must NOT be trusted to do arithmetic that deterministic code can do.

Deterministic code owns:
- APR math
- incentive persistence
- yield conversion
- Net Carry
- switching costs
- break-even math
- eligibility gates
- ShouldRebalance

AI can own:
- interpreting macro/news context
- extracting structured signals from unstructured information
- explaining why a decision was made
- generating a concise human-readable rationale

AI output that affects financial decisions must be structured and validated before use.

Do not implement "three agents talking to each other" merely for visual effect.

## Demo story

The demo should make this sequence obvious:

1. User deposits 1,000 USDC.
2. System scans USDC, ARGt and BRAt opportunities.
3. UI shows:
   - effective APR
   - base APR
   - incentive APR
   - expected FX return
   - FX volatility / risk buffer
   - Net Carry 30d
   - liquidity / eligibility
4. Agent selects the best eligible strategy.
5. Capital is deployed automatically.
6. A simulated or real market/macro change occurs.
7. Net Carry values are recomputed.
8. ShouldRebalance decides whether moving is economically justified.
9. If yes, execution happens without human confirmation.
10. UI shows the reason, costs, expected improvement and transaction result.

Example wow moment:

```text
Current: BRAt
Net Carry 30d: +0.60%

Target: ARGt
Net Carry 30d: +1.10%

Switch cost: 0.20%
Net rebalance benefit: +0.30%
Safety margin: +0.20%

Decision: REBALANCE
```

Then:
Morpho withdraw -> BRAt -> swap -> ARGt -> Morpho deposit.

If costs are too high, the agent must visibly choose HOLD.
"HOLD" is a valid intelligent decision.

## UX principles

The user should not need to understand DeFi.

Primary user flow:
1. Enter amount
2. Start autopilot
3. See where capital is allocated
4. See expected return and clear reason
5. Receive transparent rebalance history

Avoid overwhelming the user with protocol jargon on the main screen.

Use plain-language labels, with technical details available secondarily.

Good:
- "Expected 30-day carry"
- "Cost to move"
- "Why Brazil?"
- "Autopilot active"

Less useful as primary UI:
- raw smart-contract internals
- long LLM conversations
- unexplained DeFi abbreviations

## Engineering priorities

P0:
- deterministic financial engine
- unit tests for Net Carry
- unit tests for ShouldRebalance
- mock opportunity data for USDC/ARGt/BRAt
- comparison UI
- decision explanation
- one end-to-end allocation/rebalance path

P1:
- real protocol data adapters
- switching-cost estimator
- liquidity gate
- incentive persistence
- break-even
- real onchain transaction
- AI explanation/macro signal

P2:
- additional currencies
- notifications
- historical charts
- multiple risk profiles

Out of scope for MVP:
- leverage
- flash loans
- borrowing by the user
- seven-country execution
- portfolio optimization with many simultaneous positions
- production custody architecture
- guarantees of profit

## Financial communication

Never claim:
- guaranteed returns
- risk-free return
- guaranteed APY
- "highest APY = best investment"

Prefer:
- expected
- estimated
- risk-adjusted
- current
- subject to market conditions

The product is a hackathon MVP, not production financial advice or a guaranteed investment product.

## Development behavior

When asked to implement:
1. inspect the current repository first
2. propose the smallest coherent change
3. implement it
4. run relevant tests/typechecks/build
5. report what changed and any blockers

Prefer simple, readable architecture over framework complexity.

Do not silently replace the agreed financial formulas.
If a formula or assumption needs to change, call it out explicitly before changing it.
