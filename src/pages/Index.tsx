+77
-37

// src/pages/Index.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  fetchDispatchData,
  fetchDispatchingNoteData,
  fetchReallocationData,
  fetchScheduleData,
  processDispatchData,
  processReallocationData,
  getDispatchStats,
  subscribeDispatch,
  subscribeDispatchingNote,
  subscribeReallocation,
  patchDispatchingNote,
} from "@/lib/firebase";
import {
  DispatchData,
  DispatchingNoteData,
  ReallocationData,
  ScheduleData,
  ProcessedDispatchEntry,
  ProcessedReallocationEntry,
} from "@/types";
import { DispatchStats, DispatchTable, ReallocationTable } from "@/components/DataTables";
import { Button } from "@/components/ui/button";
import StockSheetTable from "@/components/StockSheetTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const IndexPage: React.FC = () => {
  // 原始数据
  const [dispatchRaw, setDispatchRaw] = useState<DispatchData>({});
  const [reallocRaw, setReallocRaw] = useState<ReallocationData>({});
  const [schedule, setSchedule] = useState<ScheduleData>([]);
  const [dispatchingNote, setDispatchingNote] = useState<DispatchingNoteData>({});

  // 处理后数据
  const [dispatchProcessed, setDispatchProcessed] = useState<ProcessedDispatchEntry[]>([]);
  const [reallocProcessed, setReallocProcessed] = useState<ProcessedReallocationEntry[]>([]);

  // UI 状态
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<'all' | 'invalid' | 'snowy' | 'canBeDispatched' | 'onHold'>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [showReallocation, setShowReallocation] = useState<boolean>(false); // 默认隐藏
  const [activeTab, setActiveTab] = useState<"stock" | "dispatch">("stock");

  // 顶部统计
  const stats = useMemo(() => getDispatchStats(dispatchRaw, reallocRaw), [dispatchRaw, reallocRaw]);

  // 初次加载 + 订阅
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

  // derive 处理数据
  useEffect(() => {
    setDispatchProcessed(processDispatchData(dispatchRaw, reallocRaw));
  }, [dispatchRaw, reallocRaw]);

  useEffect(() => {
    setReallocProcessed(processReallocationData(reallocRaw, schedule));
  }, [reallocRaw, schedule]);

  const handleSaveDispatchingNote = async (
    chassisNo: string,
    patch: Partial<DispatchingNoteData[string]>
  ) => {
    const clean = chassisNo.trim();
    if (!clean) return;
    await patchDispatchingNote(clean, { chassisNo: clean, ...patch });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 overflow-x-hidden">
      <div className="mx-auto w-full max-w-[1400px] space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900">
            Dispatch Workspace
          </h1>
          <p className="text-sm text-gray-600">Stock Sheet &amp; Dispatch overview | realtime updates</p>
        </header>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
          <TabsList className="grid w-fit grid-cols-2">
            <TabsTrigger value="stock">Stock Sheet</TabsTrigger>
            <TabsTrigger value="dispatch">Dispatch Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="stock" className="space-y-4">
            <StockSheetTable
              notes={dispatchingNote}
              schedule={schedule}
              reallocations={reallocRaw}
              onSave={handleSaveDispatchingNote}
            />
          </TabsContent>

          <TabsContent value="dispatch" className="space-y-4">
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

            <DispatchTable
              allData={dispatchProcessed}
              activeFilter={activeFilter}
              searchTerm={search}
              onSearchChange={setSearch}
              reallocationData={reallocProcessed}
            />

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
          </TabsContent>
        </Tabs>
      </div>
      {loading && <div className="text-sm text-gray-500 mt-4">Loading...</div>}
    </div>
  );
};

export default IndexPage;
