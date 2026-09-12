import { useEffect, useReducer } from 'react';
import { demoReducer, initialState, isBusy } from '../application/demoEngine.js';

export function useDemo() {
  const [state, dispatch] = useReducer(demoReducer, undefined, initialState);
  useEffect(() => {
    if (!isBusy(state.stage)) return;
    const delay = state.stage === 'SELECTED' ? 1700 : state.stage === 'REBALANCING' ? 700 : 650;
    const timer = window.setTimeout(() => dispatch({ type: 'TICK', at: Date.now() }), delay);
    return () => window.clearTimeout(timer);
  }, [state]);
  return { state, dispatch };
}
