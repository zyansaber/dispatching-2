// src/pages/Index.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  fetchDispatchData,
  fetchReallocationData,
  fetchScheduleData,
  processDispatchData,
  processReallocationData,
  getDispatchStats,
  subscribeDispatch,
  subscribeReallocation,
} from "@/lib/firebase";
import {
  DispatchData,
  ReallocationData,
  ScheduleData,
  ProcessedDispatchEntry,
  ProcessedReallocationEntry,
} from "@/types";
import { DispatchStats, DispatchTable, ReallocationTable } from "@/components/DataTables";
import { Button } from "@/components/ui/button";

const IndexPage: React.FC = () => {
  // 原始数据
  const [dispatchRaw, setDispatchRaw] = useState<DispatchData>({});
  const [reallocRaw, setReallocRaw] = useState<ReallocationData>({});
  const [schedule, setSchedule] = useState<ScheduleData>([]);

  // 处理后数据
  const [dispatchProcessed, setDispatchProcessed] = useState<ProcessedDispatchEntry[]>([]);
  const [reallocProcessed, setReallocProcessed] = useState<ProcessedReallocationEntry[]>([]);

  // UI 状态
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<'all' | 'invalid' | 'snowy' | 'canBeDispatched' | 'onHold'>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [showReallocation, setShowReallocation] = useState<boolean>(false); // 默认隐藏

  // 顶部统计
  const stats = useMemo(() => getDispatchStats(dispatchRaw, reallocRaw), [dispatchRaw, reallocRaw]);

  // 初次加载 + 订阅
  useEffect(() => {
    let unsubDispatch: (() => void) | null = null;
    let unsubRealloc: (() => void) | null = null;

    (async () => {
      setLoading(true);
      try {
        const [d, r, s] = await Promise.all([
          fetchDispatchData(),
          fetchReallocationData(),
          fetchScheduleData(),
        ]);
        setDispatchRaw(d || {});
        setReallocRaw(r || {});
        setSchedule(s || []);
      } finally {
        setLoading(false);
      }

      unsubDispatch = subscribeDispatch((d) => setDispatchRaw(d || {}));
      unsubRealloc = subscribeReallocation((r) => setReallocRaw(r || {}));
    })();

    return () => {
      unsubDispatch && unsubDispatch();
      unsubRealloc && unsubRealloc();
    };
  }, []);

  // derive 处理数据
  useEffect(() => {
    setDispatchProcessed(processDispatchData(dispatchRaw, reallocRaw));
  }, [dispatchRaw, reallocRaw]);

  useEffect(() => {
    setReallocProcessed(processReallocationData(reallocRaw, schedule));
  }, [reallocRaw, schedule]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 overflow-x-hidden">
      <div className="mx-auto w-full max-w-[1400px] space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900">Dispatch Dashboard</h1>
          <p className="text-sm text-gray-600">Operational overview | realtime updates</p>
        </header>

        <DispatchStats
          total={stats.total}
          invalidStock={stats.invalidStock}
          snowyStock={stats.snowyStock}
          canBeDispatched={stats.canBeDispatched}
          onHold={stats.onHold}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          onRefresh={() => { /* 实时订阅，无需手动 refresh */ }}
        />

        {/* 传全量，表格内部自行筛选/排序/搜索，保证 OnHold 即时分流 */}
        <DispatchTable
          allData={dispatchProcessed}
          activeFilter={activeFilter}
          searchTerm={search}
          onSearchChange={setSearch}
          reallocationData={reallocProcessed}
        />

        {/* Reallocation 默认隐藏 */}
        <div className="pt-2">
          <Button variant="outline" onClick={() => setShowReallocation((s) => !s)}>
            {showReallocation ? "Hide Reallocation" : "Show Reallocation"}
          </Button>
        </div>
        {showReallocation && (
          <ReallocationTable
            data={reallocProcessed}
            searchTerm={search}
            onSearchChange={setSearch}
            dispatchData={dispatchProcessed}
          />
        )}
      </div>
      {loading && <div className="text-sm text-gray-500 mt-4">Loading...</div>}
    </div>
  );
};

export default IndexPage;
