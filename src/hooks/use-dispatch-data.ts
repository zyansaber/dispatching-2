import { useEffect, useMemo, useState } from 'react';
import {
  DispatchData,
  DispatchingNoteData,
  ProcessedDispatchEntry,
  ProcessedReallocationEntry,
  ReallocationData,
  ScheduleData,
} from '@/types';
import {
  fetchDispatchData,
  fetchDispatchingNoteData,
  fetchReallocationData,
  fetchScheduleData,
  getDispatchStats,
  processDispatchData,
  processReallocationData,
  subscribeDispatch,
  subscribeDispatchingNote,
  subscribeReallocation,
} from '@/lib/firebase';

export type DispatchSnapshot = {
  loading: boolean;
  dispatchRaw: DispatchData;
  reallocRaw: ReallocationData;
  schedule: ScheduleData;
  dispatchingNote: DispatchingNoteData;
  dispatchProcessed: ProcessedDispatchEntry[];
  reallocProcessed: ProcessedReallocationEntry[];
  stats: ReturnType<typeof getDispatchStats>;
};

export function useDispatchData(): DispatchSnapshot {
  const [dispatchRaw, setDispatchRaw] = useState<DispatchData>({});
  const [reallocRaw, setReallocRaw] = useState<ReallocationData>({});
  const [schedule, setSchedule] = useState<ScheduleData>([]);
  const [dispatchingNote, setDispatchingNote] = useState<DispatchingNoteData>({});
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let unsubDispatch: (() => void) | null = null;
    let unsubRealloc: (() => void) | null = null;
    let unsubNote: (() => void) | null = null;

    (async () => {
      setLoading(true);
      try {
        const [d, r, s, n] = await Promise.all([
          fetchDispatchData(),
          fetchReallocationData(),
          fetchScheduleData(),
          fetchDispatchingNoteData(),
        ]);
        setDispatchRaw(d || {});
        setReallocRaw(r || {});
        setSchedule(s || []);
        setDispatchingNote(n || {});
      } finally {
        setLoading(false);
      }

      unsubDispatch = subscribeDispatch((d) => setDispatchRaw(d || {}));
      unsubRealloc = subscribeReallocation((r) => setReallocRaw(r || {}));
      unsubNote = subscribeDispatchingNote((n) => setDispatchingNote(n || {}));
    })();

    return () => {
      unsubDispatch && unsubDispatch();
      unsubRealloc && unsubRealloc();
      unsubNote && unsubNote();
    };
  }, []);

  const dispatchProcessed = useMemo(
    () => processDispatchData(dispatchRaw, reallocRaw),
    [dispatchRaw, reallocRaw],
  );

  const reallocProcessed = useMemo(
    () => processReallocationData(reallocRaw, schedule),
    [reallocRaw, schedule],
  );

  const stats = useMemo(
    () => getDispatchStats(dispatchRaw, reallocRaw),
    [dispatchRaw, reallocRaw],
  );

  return {
    loading,
    dispatchRaw,
    reallocRaw,
    schedule,
    dispatchingNote,
    dispatchProcessed,
    reallocProcessed,
    stats,
  };
}
