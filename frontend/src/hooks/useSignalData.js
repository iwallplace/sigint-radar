import { useState, useCallback, useEffect } from "react";

export default function useSignalData() {
  const [signals, setSignals] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);

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
    // Don't clear selectedId — snapshot keeps panel open
  }, []);

  // Update snapshot whenever the live signal changes
  useEffect(() => {
    if (selectedId && signals[selectedId]) {
      setSelectedSnapshot(signals[selectedId]);
    }
  }, [selectedId, signals]);

  const signalList = Object.values(signals).sort(
    (a, b) => (b.weirdness_score || 0) - (a.weirdness_score || 0)
  );

  // Live signal or snapshot fallback
  const selectedSignal = (selectedId && signals[selectedId]) || selectedSnapshot;

  const selectSignal = useCallback((id) => {
    if (id === null) {
      setSelectedSnapshot(null);
    }
    setSelectedId(id);
  }, []);

  return {
    signals,
    signalList,
    selectedId,
    selectedSignal,
    setSelectedId: selectSignal,
    addSignal,
    updateSignal,
    removeSignal,
  };
}
