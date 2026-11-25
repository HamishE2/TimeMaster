import { createContext } from 'react';

// The workspace's rate levels ([{ id, name, rate }]), so a costing's "Costed
// at" label can be shown wherever costings are picked.
export const LevelsContext = createContext([]);
