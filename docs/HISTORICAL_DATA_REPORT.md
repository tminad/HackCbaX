# Historical Data Report

Generated from retrieved public data: 2026-09-12T13:39:44.002Z. Reproduce offline with `npm run historical:analyze`; refresh public sources with `npm run historical:discover`. Machine-readable sources/parameters are in [discovery.json](../data/historical/discovery.json); final metrics in [analysis-summary.json](../data/historical/analysis-summary.json).

## Recommendation: NO

Available history is not sufficient for a compelling, execution-valid autonomous replay at the demo's $1,000 size. The discovered pools are small, the calibrated two-hop slippage exceeds the approved 0.50% cap, and historical execution eligibility is incomplete. This is useful real-data groundwork and a transparent risk-gate demonstration, but it does not establish profitable or executable historical rebalancing. Adding AI cannot resolve missing liquidity or historical evidence. No market signal was fabricated to force a move.

## Infrastructure (Arbitrum 42161)

| Asset | Token | Selected Morpho V2 vault | Curve pool against USDt0 |
| --- | --- | --- | --- |
| ARGt | 0x59863989d080B22476DB95656d0C3CC18be92214 | 0x9Dd3F844747AB78d616BF76DB92756E17A064aDD | 0x356D349dA9ADd7Efb56a35fAB939A2c6D852f853 |
| BRAt | 0xC4ed6Aba5373D78E160F4df39e011F078Be54df8 | 0x207396cBE2F6f50670EaA69584c9f723924C7Fe9 | 0xEef48Df5F1c509cD9730774b4e8A4464626ef8D5 |

Route: ARGt → USDt0 → BRAt (and reverse); intermediate 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9. Exact-token registry search found 0 direct ARGt/BRAt pools. No direct pair is silently assumed. Entry from USDC has not been verified; exploratory runs assume funding access, not a real USDC transaction.

Issuer: [Twin](https://stablecoins.twin.finance/). Pools: [Curve registry](https://api.curve.finance/v1/getPools/all/arbitrum). Token creation is verified with Blockscout address → creation transaction endpoints in discovery.json. Pool deployment dates are registry creationTs, not press announcement dates.

| Infrastructure | Availability UTC |
| --- | --- |
| ARGt token | 2026-04-29T20:44:56.000Z |
| ARGt selected vault | 2026-06-16T18:53:58.000Z |
| ARGt/USDt0 pool | 2026-08-24T18:55:33.000Z |
| BRAt token | 2026-04-29T20:53:47.000Z |
| BRAt selected vault | 2026-08-03T19:46:06.000Z |
| BRAt/USDt0 pool | 2026-08-24T19:00:47.000Z |

All discovered exact-token vaults (V1 count: 0):

| Name | Address | Asset | Created UTC | Current native APY | Current reported net rate | Listed |
| --- | --- | --- | --- | ---: | ---: | --- |
| (unnamed) | 0x10c49bf632663f9599B5caCEbb2cbe13e7a50970 | ARGt | 2026-05-25T19:20:38.000Z | 0.000000% | 0.000000% | false |
| BRAt Prime | 0x207396cBE2F6f50670EaA69584c9f723924C7Fe9 | BRAt | 2026-08-03T19:46:06.000Z | 2.613079% | 12.001563% | false |
| ARGt Prime | 0x9Dd3F844747AB78d616BF76DB92756E17A064aDD | ARGt | 2026-06-16T18:53:58.000Z | 0.014714% | 17.000016% | false |

Selected ARGt Prime and BRAt Prime match the named strategies and Merkl incentive campaigns. The other ARGt vault is unnamed, unlisted and reports zero rates; it is retained in discovery rather than silently selected. Selected vaults also report listed=false; discovery filters underlying addresses, not only a curated listed-vault screen. Historical USD TVL is mostly null in Morpho; token totalAssets and idleAssets exist hourly. Idle assets are NOT full maxWithdraw/deposit capacity. Incentives are reconstructed separately through Merkl where schedules are usable.

## Sources and rate normalization

- Morpho POST https://api.morpho.org/graphql: vaultV2s filtered by chainId_in:[42161], assetAddress_in; vaultV2ByAddress.historicalState avgApy/avgNetApy (lookbackHours:1), totalAssets, totalAssetsUsd, idleAssets with interval:HOUR. Exact bounds/fields are recorded in discovery.sources and the query builder in src/adapters/morpho/client.ts. [Morpho rate documentation](https://docs.morpho.org/developers/api/morpho-vaults/).
- Native hourly realized APY is converted in the adapter to equivalent APR: n × expm1(log1p(APY)/n), n=8760. This explicitly assumes hourly compounding; it does not assert recovery of an undocumented original nominal APR. Reward rates are APR, normalized from percentage points /100, without APY conversion. Combined avgNetApy is audit-only because native APY and reward APR must not be converted together. [Morpho yield components](https://docs.morpho.org/developers/earn/vault-ux/best-practices/).
- Merkl GET https://api.merkl.xyz/v4/campaigns?opportunityId=ID&items=100&page=PAGE, then /v4/campaigns/ID/metrics. Opportunity IDs: ARGt 11859569989119475260, BRAt 11638794514051721299. aprRecords are provider-recorded projected reward APR, not realized payout; tvlRecords are real recorded USD TVL. Daily buckets are delayed to next UTC day, pre-start buckets excluded, campaigns only considered after createdAt/start. hasOverrides campaigns have missing historical days-left; no current schedule is silently backdated. [Merkl API semantics](https://docs.merkl.xyz/integrate-merkl/app).
- ArgentinaDatos official ARS buy/sell midpoint: https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial. BRL/USD ECB observations through Frankfurter: https://api.frankfurter.dev/v1/2026-04-01..2026-09-11?base=USD&symbols=BRL. Both inverted to USD/local; actual token peg/spread risk remains missing. These are real equivalent fiat FX observations, not Twin token market prices.
- Curve registry https://api.curve.finance/v1/getPools/all/arbitrum: actual token pairs, current reserves/TVL/oracle and deployment dates. Prices API /v1/ohlc/arbitrum/POOL with exact URLs in discovery.curveHistory; daily close units are inverted from local/USDt0 to USDt0/local. /v1/liquidity/arbitrum/POOL?per_page=100&include_state=true returned counts ARGt=0, BRAt=0. Repeated OHLC closes do not prove repeated trades.
- Read-only https://arb1.arbitrum.io/rpc: fee() selector 0xddca3f43, get_dy(uint256,uint256,uint256) selector 0x556d6e9f, pinned quote block 0x1e10b3e4; fee precision 1e10. eth_gasPrice and Blockscout exchange_rate provide current calibration inputs only. No signing or transaction execution.

## History and common window

Infrastructure commonStart = max(two token deployments, two selected vault deployments, BOTH required pool deployments) = **2026-08-24T19:00:47.000Z**.

Hourly sampled replay: **2026-08-24T20:00:00.000Z → 2026-09-12T12:00:00.000Z**, **449 timestamps** (two asset slots each). Yield granularity HOUR; incentives daily; ARS daily and BRL business days. Hourly repetition of daily data is not additional independent FX information. First complete two-asset financial comparison: **2026-09-06T00:00:00.000Z**, 157 complete comparisons. A strict execution-ready commonStart is **MISSING**, because complete historical gate evidence has not been retrieved. Infrastructure availability is not proof that a trade was executable.

| Source | Earliest fetched non-null datapoint UTC | Coverage |
| --- | --- | --- |
| ARGt Morpho native yield | 2026-06-16T20:00:00.000Z | 2105 hourly APR observations |
| ARGt official FX fetched warm-up | 2026-04-01T00:00:00.000Z | 164 daily/business-day observations |
| ARGt Merkl reward bucket | 2026-06-19T00:00:00.000Z | Daily projected APR, not payout; pre-campaign buckets rejected |
| ARGt Curve OHLC | 2026-08-26T00:00:00.000Z | 17 daily closes |
| BRAt Morpho native yield | 2026-08-03T21:00:00.000Z | 952 hourly APR observations |
| BRAt official FX fetched warm-up | 2026-04-01T00:00:00.000Z | 115 daily/business-day observations |
| BRAt Merkl reward bucket | 2026-08-05T00:00:00.000Z | Daily projected APR, not payout; pre-campaign buckets rejected |
| BRAt Curve OHLC | MISSING | 0 daily closes |

Morpho yields and official FX exist before the pool commonStart. They can support longer strategy-validation research, but are not mixed into the strict infrastructure window. FX fetched from April 1 supplies trailing warm-up; it is not claimed as the FX provider's first-ever record. Dataset excludes off-grid/latest observations returned beyond the requested end.

## Real / modeled / missing matrix

| Variable | REAL retrieved | MODELED / derived | MISSING |
| --- | --- | --- | --- |
| Native yield | Morpho hourly realized APY | Explicit hourly APY→APR convention | Null observations omitted |
| Incentive yield | Merkl projected reward APR history | Daily availability lag | Overridden historical schedules / some campaign gaps |
| Total assets | Morpho token units hourly | USD valuation using official FX proxy | Most direct Morpho USD history |
| Vault USD TVL | Merkl daily tvlRecords preferred | Token assets × official FX only as fallback | Exact executable valuation |
| Withdrawability | Morpho idle token inventory | Idle USD proxy in exploratory runs | Full historical maxWithdraw/capacity |
| Fiat FX | Official ARS midpoint and ECB BRL | Used as token FX proxy; trailing volatility derived | Token depeg and executable spreads |
| Curve price | ARGt/USDt0 indexed daily closes | Daily close publication lag | BRAt closes and ARGt/BRAt cross |
| Curve reserves / TVL | Current registry | Current half-minimum-pool-TVL route budget in exploratory replay | Historical indexed liquidity/reserves |
| Swap fee | Current onchain fee() | Current two-leg fee projected backward | Exact historical fee series |
| Slippage | Current size-dependent get_dy quotes | Current impact projected backward; STRESS multiplier | Exact historical trade-size slippage |
| Gas | Current gas price / ETH quote | Assumed gas units and STRESS multiplier | Historical transaction gas / L1 posting overhead |
| Protocol eligibility / alerts | Selected protocol exists in approved whitelist | Exploratory assumes deposit allowed / no critical alert | Historical capacity, flags, route safety |

Missing fields stay absent in JSON and blank in CSV. No zero APY, liquidity, risk flag or price is inserted to replace missing data. Zero incentives are only assigned for unambiguous zero-native/zero-total source observations without a known active campaign.

## Past-only decisions

**NEUTRAL FX BASELINE — PRE-AI**: expectedFxReturn30d=0 on every StrategySnapshot. Realized FX movement is observation/ex-post context only, never a forecast. Trailing volatility uses sample standard deviation of log(price ratios)/sqrt(elapsed calendar days), scaled by sqrt(30), over the preceding 60 days; at least 20 returns, no gap over seven days. Both observation timestamp and publication availability must be <= T. Daily FX/incentive buckets become usable next day; stale FX (>5 days) is missing. Retrospective provider revisions and unknown historical reward-announcement timing remain limitations; this is not a point-in-time audited trading backtest.

The scanner, eligibility checks, effective APR/Net Carry, ShouldRebalance and 12-hour cooldown are imported unchanged from the approved core. No financial decisions are made in React. No Gemini, UI redesign, fabricated USDC strategy or blockchain execution.

## Execution scenarios and sensitivity

| Scenario | Size USD | Swap fee | Slippage | Gas | Other | Total estimated switch cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| base | 1000 | 0.600000% | 1.202632% | 0.005081% | 0.000000% | 1.807713% |
| stress | 1000 | 0.600000% | 2.405264% | 0.015242% | 0.000000% | 3.020506% |
| smallBase | 100 | 0.600000% | 0.120116% | 0.050805% | 0.000000% | 0.770921% |
| smallStress | 100 | 0.600000% | 0.240231% | 0.152416% | 0.000000% | 0.992647% |

Current per-pool fees: 0.300000% and 0.300000%. The domain's additive switch-cost formula receives their sum. BASE slippage is the larger measured two-hop finite-size impact in either direction versus a $1 reference, not an arbitrary cheap assumption. Calibrated 2026-09-12T13:40:00.318Z. Gas budget=1000000 units is an explicit assumption (not an observed transaction); current gas=20000000 wei, current ETH/USD=2540.26. Other fees=0 is an assumption. STRESS multiplies impact by 2 and gas by 3; these are scenario multipliers, not historical facts. All components are configurable outside src/domain. The two-hop budget is conservative for initial deployment, whose real USDC route remains unverified.

At $1,000 BASE and STRESS do not bypass the core's slippage gate. The additional $100 runs use fresh quotes at that size, not scaled-down arbitrary impact. They test size sensitivity only and do not replace the requested $1,000 result. Exact historical Curve fee/slippage/gas reconstruction was stopped after the simple indexed endpoints lacked sufficient coverage; transaction-perfect archive reconstruction is outside this hackathon session.

## Replay metrics

BASE/STRESS files are explicitly EXPLORATORY with modeled availability; strict results are separate. Market rate observations are real in all runs. Ineligible observations count excluded asset-time pairs, while SKIP counts timestamps. HOLD is counted only when ShouldRebalance actually returns HOLD; a blocked initial allocation is SKIP, not an invented HOLD. Candidate rebalances count a different target meeting the economic margin before cooldown/execution rejection; actual rebalances count approved moves. Initial allocation has no switching-cost deduction or cooldown.

| Replay | Ranking changes | HOLD | Candidate rebalance | REBALANCE | Cooldown blocks | Ineligible asset observations | SKIP | Selected counts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| base | 0 | 0 | 0 | 0 | 0 | 898 | 449 | {} |
| stress | 0 | 0 | 0 | 0 | 0 | 898 | 449 | {} |
| strict | 0 | 0 | 0 | 0 | 0 | 898 | 449 | {} |
| smallBase | 2 | 448 | 0 | 0 | 0 | 292 | 0 | {"ARGt":448,"BRAt":1} |
| smallStress | 2 | 448 | 0 | 0 | 0 | 292 | 0 | {"ARGt":448,"BRAt":1} |

Financial diagnostic ranking (ignores modeled slippage, is NOT an executable ranking): 2 changes across available candidates. Two-complete-asset winner counts: {"ARGt":156,"BRAt":1}. Missing candidates can change the available-universe leader; only complete two-asset comparisons are used for the demo dates below. No eligible selected strategy at $1,000 means most-selected executable strategy is NONE, not a fabricated winner.

BASE versus STRESS at $1,000: 0 versus 0 rebalances; 0 versus 0 HOLDs. Cost differences do not establish robustness when both runs are blocked. At $100: 0 versus 0 rebalances, 448 versus 448 HOLDs. These are modeled-availability diagnostics, not historical execution claims.

## Yield / liquidity statistics within the sampled common window

Numbers are min / max / median. APR fractions are displayed as percentages. Effective APR uses the approved incentive-persistence formula and only complete observations. Base APR is not mislabeled total yield. TVL prefers recorded source USD values and falls back to official FX only when needed (tvlUsdBasis records which). Neither TVL nor USD proxy ranges are liquidity gates.

| Variable | ARGt | BRAt |
| --- | --- | --- |
| baseApr | 0.006394% / 0.014617% / 0.010550% (n=449) | 1.915450% / 7.842499% / 2.191572% (n=449) |
| incentiveApr | 16.985394% / 16.993587% / 16.989488% (n=449) | 9.447078% / 10.024364% / 9.770102% (n=417) |
| nominalApr | 16.998435% / 17.003653% / 17.000038% (n=449) | 11.934025% / 17.289577% / 11.958285% (n=157) |
| effectiveApr | 8.719631% / 17.003653% / 14.003398% (n=449) | 11.934025% / 17.289577% / 11.958285% (n=157) |
| yield30d | 0.716682% / 1.397561% / 1.150964% (n=449) | 0.980879% / 1.421061% / 0.982873% (n=157) |
| tvlUsd | 4755146.29 / 4888557.24 / 4825421.65 (n=449) | 36661.13 / 37620.65 / 37229.85 (n=449) |
| idleLiquidityUsdProxy | 5040909.03 / 5107043.48 / 5075835.14 (n=449) | 31205.91 / 31974.06 / 31551.22 (n=449) |
| merklRecordedTvlUsd | 4755146.29 / 4888557.24 / 4831561.12 (n=18) | 36661.13 / 37620.65 / 37235.90 (n=19) |

## Three historical demo inspection points

1. **2026-09-06T00:00:00.000Z** — First timestamp with complete financial inputs for BOTH assets (execution still modeled/blocked). Ranking: ARGt carry 0.678880%, BRAt carry 0.312854%. Actual $1,000 action: SKIP.
2. **2026-09-12T10:00:00.000Z** — Best financial ranking changed; diagnostic ignores slippage, not an executed trade. Ranking: BRAt carry 0.756868%, ARGt carry 0.430080%. Actual $1,000 action: SKIP.
3. **2026-09-12T11:00:00.000Z** — Best financial ranking changed; diagnostic ignores slippage, not an executed trade. Ranking: ARGt carry 0.428141%, BRAt carry 0.318271%. Actual $1,000 action: SKIP.

These dates explain market evidence and execution constraints; they are not selected to imply trades that did not happen.

## Limitations and next step

No complete strict execution history; short common pool window; daily incentive/publication assumptions; campaign overrides; official fiat/token basis mismatch; no historical BRAt Curve price; no historical USDC entry route or defensive yield strategy; current pool budgets projected backward; no realized portfolio P&L. ARGt idle inventory valued at official FX can exceed Merkl's recorded USD TVL because their price bases and timestamps differ; these USD series must not be interpreted as comparable maxWithdraw/TVL ratios. Historical vault-fee changes are not reconstructed; selected vaults currently report zero management/performance fees. Historical asset totals are converted from large integer token units to JS numbers for analytics, not transaction amounts. Read-only quote amounts retain BigInt precision. Optional endpoint failures: [].

Next smallest step: present this saved dataset in a minimal read-only replay view using the existing UI components, with real/modeled/missing evidence and blocked-execution reasons visible. Before claiming executable replay, obtain dated deposit/withdrawal/alert evidence and verify a smaller-position entry/switch route. Keep Gemini and transaction execution separate.
