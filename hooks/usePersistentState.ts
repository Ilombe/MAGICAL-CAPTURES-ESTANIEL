// FIX: Import `React` to make the React namespace available for TypeScript
import React, { useState, useEffect } from 'react';

function usePersistentState<T,>(key: string, initialState: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const storageValue = window.localStorage.getItem(key);
      return storageValue ? JSON.parse(storageValue) : initialState;
    } catch (error) {
      console.error("Error reading from localStorage", error);
      return initialState;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error("Error writing to localStorage", error);
    }
  }, [key, state]);

  return [state, setState];
}

export default usePersistentState;
