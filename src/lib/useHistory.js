import { useCallback, useReducer } from 'react';

// Workspace state with undo/redo. `set` behaves like a useState setter
// (value or updater) and records history; `reset` replaces state without
// history (loading a session or a file). Rapid edits, such as typing hours,
// merge into one step so a single undo reverts the whole burst.
const LIMIT = 100;
const MERGE_MS = 800;

export function reducer(state, action) {
  switch (action.type) {
    case 'set': {
      const next =
        typeof action.update === 'function'
          ? action.update(state.present)
          : action.update;
      if (next === state.present) return state;
      const merge =
        action.at - state.lastAt < MERGE_MS && state.past.length > 0;
      return {
        past: merge ? state.past : [...state.past, state.present].slice(-LIMIT),
        present: next,
        future: [],
        lastAt: action.at,
      };
    }
    case 'undo': {
      if (!state.past.length) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past.at(-1),
        future: [state.present, ...state.future],
        lastAt: 0,
      };
    }
    case 'redo': {
      if (!state.future.length) return state;
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
        lastAt: 0,
      };
    }
    case 'reset':
      return { past: [], present: action.value, future: [], lastAt: 0 };
    default:
      return state;
  }
}

export default function useHistory(initial) {
  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: initial,
    future: [],
    lastAt: 0,
  });
  const set = useCallback(
    (update) => dispatch({ type: 'set', update, at: Date.now() }),
    [],
  );
  const reset = useCallback((value) => dispatch({ type: 'reset', value }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  return {
    data: state.present,
    setData: set,
    resetData: reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
