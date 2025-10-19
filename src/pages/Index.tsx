import React, { useEffect, useMemo, useState } from "react";
import {
  fetchDispatchData,
  fetchReallocationData,
  fetchScheduleData,
  processDispatchData,
  processReallocationData,
  getDispatchStats,
  filterDispatchData,
} from "@/lib/firebase";
import { DispatchData, ReallocationData, ScheduleData, ProcessedDispatchEntry, ProcessedReallocationEntry } from "@/types";
import { DispatchStats, DispatchTable, ReallocationTable } from "@/components/DataTables";

const IndexPage: React.FC = () => {
  // ---------- 原始数据 ----------
  const [dispatchRaw, setDispatchRaw] = useState<DispatchData>({});
  const [reallocRaw, setReallocRaw] = useState<ReallocationData>({});
  const [schedule, setSchedule] = useState<ScheduleData>([]);

  // ---------- UI 状态 ----------
  const [search, setSearch] = useState("");
  // 关键：定义 filter，避免 “filter is not defined”
  const [filter, setFilter] = useState<"all" | "invalid" | "snowy" | "canBeDispatched" | "onHold">("all");
  const [loading, setLoading] = useState(false);

  // ---------- 拉取数据 ----------
  const loadAll = async () => {
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
  };

  useEffect(() => {
    loadAll();
  }, []);

  // ---------- 处理数据 ----------
  const reallocProcessed: ProcessedReallocationEntry[] = useMemo(
    () => processReallocationData(reallocRaw, schedule),
    [reallocRaw, schedule]
  );

  const dispatchProcessed: ProcessedDispatchEntry[] = useMemo(
    () => processDispatchData(dispatchRaw, reallocRaw),
    [dispatchRaw, reallocRaw]
  );

  // 顶部统计（含 onHold）
  const stats = useMemo(
    () => getDispatchStats(dispatchRaw, reallocRaw),
    [dispatchRaw, reallocRaw]
  );

  // 根据顶部筛选卡片决定主表数据（注意：filterDispatchData 需要原始 reallocationData）
  const visibleDispatch: ProcessedDispatchEntry[] = useMemo(
    () => filterDispatchData(dispatchProcessed, filter, reallocRaw),
    [dispatchProcessed, filter, reallocRaw]
  );

  return (
    <div className="p-4 md:p-6 w-full max-w-full overflow-x-hidden space-y-6">
      {/* 顶部统计卡片（新增 onHold） */}
      <DispatchStats
        total={stats.total}
        invalidStock={stats.invalidStock}
        snowyStock={stats.snowyStock}
        canBeDispatched={stats.canBeDispatched}
        onHold={stats.onHold}                 // ✅ 显示 On Hold 数量
        activeFilter={filter}
        onFilterChange={setFilter}            // ✅ 点击卡片切换过滤
        onRefresh={loadAll}
      />

      {/* 发运主表（两行一组 + 白灰分隔；无横向滚动；支持 OnHold/Comment/Pickup 实时写库） */}
      <DispatchTable
        data={visibleDispatch}                // ✅ 已按 filter 过滤后的数据
        allData={dispatchProcessed}           // 用于乐观层对齐
        filter={filter}                       // ✅ 传入，避免未定义
        searchTerm={search}
        onSearchChange={setSearch}
        reallocationData={reallocProcessed}   // 表格里做联动搜索展示
      />

      {/* 调拨表（如你首页需要保留） */}
      <ReallocationTable
        data={reallocProcessed}
        searchTerm={search}
        onSearchChange={setSearch}
        dispatchData={dispatchProcessed}
      />

      {loading && (
        <div className="text-sm text-gray-500">Loading...</div>
      )}
    </div>
  );
};

export default IndexPage;
