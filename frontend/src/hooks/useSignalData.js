import { useState, useCallback } from "react";

export default function useSignalData() {
  const [signals, setSignals] = useState({});
  const [selectedId, setSelectedId] = useState(null);

  const addSignal = useCallback((signal) => {
    setSignals((prev) => ({ ...prev, [signal.id]: signal }));
  }, []);

  const updateSignal = useCallback((signal) => {
    setSignals((prev) => {
      const existing = prev[signal.id];
      if (!existing) return prev;
      return { ...prev, [signal.id]: { ...existing, ...signal } };
    });
  }, []);

  const removeSignal = useCallback((signalId) => {
    setSignals((prev) => {
      const next = { ...prev };
      delete next[signalId];
      return next;
    });
    setSelectedId((prev) => (prev === signalId ? null : prev));
  }, []);

  const signalList = Object.values(signals).sort(
    (a, b) => (b.weirdness_score || 0) - (a.weirdness_score || 0)
  );

  return {
    signals,
    signalList,
    selectedId,
    setSelectedId,
    addSignal,
    updateSignal,
    removeSignal,
  };
}
