export type ReplayAiStatus = 'live' | 'cached' | 'unavailable';

export interface HistoricalReplayAsset {
  yield30d: number; riskBuffer: number; baseFx: number; aiAdjustment: number; finalFx: number; netCarry: number; preAiCarry: number;
}
export interface HistoricalReplaySignal { status: ReplayAiStatus; score: number | null; confidence: number | null; summary: string; }
export interface HistoricalReplayCheckpoint {
  checkpoint: string; preAiWinner: 'ARGt' | 'BRAt'; decision: 'STAY_USDC' | 'HOLD_USDC';
  assets: { ARGt: HistoricalReplayAsset; BRAt: HistoricalReplayAsset };
  signals: { ARS: HistoricalReplaySignal; BRL: HistoricalReplaySignal };
}

/** Snapshot of the validated 2026-09-12 Gemini run. No API call is made from the browser. */
export const historicalReplayCheckpoints: readonly HistoricalReplayCheckpoint[] = [
  {
    "checkpoint": "2026-09-06T00:00:00.000Z",
    "preAiWinner": "ARGt",
    "decision": "STAY_USDC",
    "assets": {
      "ARGt": {
        "yield30d": 0.01019062066892827,
        "riskBuffer": 0.003401822584821635,
        "baseFx": -0.03833865814696491,
        "aiAdjustment": -0.001125,
        "finalFx": -0.03946365814696491,
        "netCarry": -0.032674860062858274,
        "preAiCarry": 0.006788798084106635
      },
      "BRAt": {
        "yield30d": 0.009821587931368442,
        "riskBuffer": 0.006693046574270582,
        "baseFx": -0.01703846153846167,
        "aiAdjustment": 0.0018000000000000002,
        "finalFx": -0.01523846153846167,
        "netCarry": -0.012109920181363809,
        "preAiCarry": 0.0031285413570978603
      }
    },
    "signals": {
      "ARS": {
        "status": "cached",
        "score": -0.3,
        "confidence": 0.75,
        "summary": "The Argentine Peso (ARS) faces mild short-term macro pressure due to market expectations of nominal depreciation from the current spot level of 1505 ARS/USD towards 1530.40 in September and 1565 in October, along with expected monthly CPI inflation of 1.8%. This pressure is partially mitigated by BCRA's reaffirmed fiscal and monetary inflation anchors and reported past FX reserve accumulation."
      },
      "BRL": {
        "status": "cached",
        "score": 0.45,
        "confidence": 0.8,
        "summary": "BRL benefits from strong carry support driven by a high 14% Selic policy rate alongside subdued near-term inflation (IPCA July at 0.07% and IPCA-15 August at -0.40%). This provides high real interest rates. Moderate counter-pressure comes from Focus survey expectations predicting slight depreciation toward 5.20 BRL/USD by October 2026."
      }
    }
  },
  {
    "checkpoint": "2026-09-12T10:00:00.000Z",
    "preAiWinner": "BRAt",
    "decision": "HOLD_USDC",
    "assets": {
      "ARGt": {
        "yield30d": 0.007205588230214388,
        "riskBuffer": 0.0029047902926109784,
        "baseFx": -0.03514376996805113,
        "aiAdjustment": 0,
        "finalFx": -0.03514376996805113,
        "netCarry": -0.03084297203044772,
        "preAiCarry": 0.00430079793760341
      },
      "BRAt": {
        "yield30d": 0.014210610972457299,
        "riskBuffer": 0.006641930269416457,
        "baseFx": -0.017153846153846186,
        "aiAdjustment": 0.0019125000000000001,
        "finalFx": -0.015241346153846185,
        "netCarry": -0.007672665450805343,
        "preAiCarry": 0.007568680703040842
      }
    },
    "signals": {
      "ARS": {
        "status": "unavailable",
        "score": null,
        "confidence": null,
        "summary": "Gemini signal unavailable. The engine used the published quantitative FX baseline with a neutral AI adjustment."
      },
      "BRL": {
        "status": "cached",
        "score": 0.45,
        "confidence": 0.85,
        "summary": "Brazilian Real (BRL) benefits from strong macro fundamentals in the short term. The central bank maintains a high policy Selic rate of 14.0% per annum, while August IPCA data registered deflation of -0.32% (bringing 12-month inflation down to 4.22%). This combination boosts real yields substantially, offering robust carry support against the USD. However, BCB Focus survey expectations signal potential mild exchange rate depreciation toward 5.20 BRL/USD by October 2026 compared to the current spot level of 5.1108."
      }
    }
  },
  {
    "checkpoint": "2026-09-12T11:00:00.000Z",
    "preAiWinner": "ARGt",
    "decision": "HOLD_USDC",
    "assets": {
      "ARGt": {
        "yield30d": 0.007186204224139812,
        "riskBuffer": 0.0029047902926109784,
        "baseFx": -0.03514376996805113,
        "aiAdjustment": 0,
        "finalFx": -0.03514376996805113,
        "netCarry": -0.030862356036522296,
        "preAiCarry": 0.004281413931528833
      },
      "BRAt": {
        "yield30d": 0.009824640964156865,
        "riskBuffer": 0.006641930269416457,
        "baseFx": -0.017153846153846186,
        "aiAdjustment": 0.0019125000000000001,
        "finalFx": -0.015241346153846185,
        "netCarry": -0.012058635459105778,
        "preAiCarry": 0.0031827106947404076
      }
    },
    "signals": {
      "ARS": {
        "status": "unavailable",
        "score": null,
        "confidence": null,
        "summary": "Gemini signal unavailable. The engine used the published quantitative FX baseline with a neutral AI adjustment."
      },
      "BRL": {
        "status": "cached",
        "score": 0.45,
        "confidence": 0.85,
        "summary": "Brazilian Real (BRL) benefits from strong macro fundamentals in the short term. The central bank maintains a high policy Selic rate of 14.0% per annum, while August IPCA data registered deflation of -0.32% (bringing 12-month inflation down to 4.22%). This combination boosts real yields substantially, offering robust carry support against the USD. However, BCB Focus survey expectations signal potential mild exchange rate depreciation toward 5.20 BRL/USD by October 2026 compared to the current spot level of 5.1108."
      }
    }
  }
] as const;
