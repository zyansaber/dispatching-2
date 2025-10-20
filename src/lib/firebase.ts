// src/lib/firebase.ts
// 仅包含 Firebase 初始化 + 数据访问/工具函数。不要放任何 React/JSX！

import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, push, update } from "firebase/database";
import type {
  ReallocationData,
  DispatchData,
  ScheduleData,
  ProcessedReallocationEntry,
  ProcessedDispatchEntry,
} from "@/types";

// —— 初始化 Firebase ——
// （如果你的项目里已有初始化，这里保持一致；避免重复初始化）
const firebaseConfig = {
  apiKey: "AIzaSyBcczqGj5X1_w9aCX1lOK4-kgz49Oi03Bg",
  authDomain: "scheduling-dd672.firebaseapp.com",
  databaseURL:
    "https://scheduling-dd672-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "scheduling-dd672",
  storageBucket: "scheduling-dd672.firebasestorage.app",
  messagingSenderId: "432092773012",
  appId: "1:432092773012:web:ebc7203ea570b0da2ad281",
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);

// —— 工具：转义 RTDB 的 key ——
// （Firebase RTDB key 不允许 . # $ [ ] / 等字符）
export function escapeKey(key: string) {
  return key.replace(/[.#$\[\]\/]/g, "_");
}

// —— Dispatch 节点的引用/局部更新 ——
// 路径：/Dispatch/<Chassis No>
export function dispatchRef(chassisNo: string) {
  return ref(database, `Dispatch/${escapeKey(chassisNo)}`);
}

export async function patchDispatch(
  chassisNo: string,
  data: Record<string, any>
) {
  await update(dispatchRef(chassisNo), data);
}

// —— 通用读取 ——
// 这些函数供页面加载数据源使用
export const fetchReallocationData = async (): Promise<ReallocationData> => {
  try {
    const snapshot = await get(ref(database, "reallocation"));
    return snapshot.val() || {};
  } catch (error) {
    console.error("Error fetching reallocation data:", error);
    return {};
  }
};

export const fetchDispatchData = async (): Promise<DispatchData> => {
  try {
    const snapshot = await get(ref(database, "Dispatch"));
    return snapshot.val() || {};
  } catch (error) {
    console.error("Error fetching dispatch data:", error);
    return {};
  }
};

export const fetchScheduleData = async (): Promise<ScheduleData> => {
  try {
    const snapshot = await get(ref(database, "schedule"));
    return snapshot.val() || [];
  } catch (error) {
    console.error("Error fetching schedule data:", error);
    return [];
  }
};

// —— 错误上报（写入 /dispatchError） ——
export const reportError = async (
  chassisNo: string,
  errorDetails: string
): Promise<boolean> => {
  try {
    const errorData = {
      chassisNo,
      errorDetails,
      timestamp: new Date().toISOString(),
      status: "reported",
    };
    await push(ref(database, "dispatchError"), errorData);
    return true;
  } catch (error) {
    console.error("Error reporting error:", error);
    return false;
  }
};

// —— 日期工具（DD/MM/YYYY 解析） ——
const parseDDMMYYYY = (dateString: string): Date => {
  if (!dateString || typeof dateString !== "string") return new Date(0);
  const parts = dateString.trim().split("/");
  if (parts.length !== 3) return new Date(0);
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  if (
    isNaN(day) ||
    isNaN(month) ||
    isNaN(year) ||
    day < 1 ||
    day > 31 ||
    month < 0 ||
    month > 11 ||
    year < 1900
  )
    return new Date(0);
  return new Date(year, month, day);
};

// —— 业务处理函数（留给原页面使用） ——

// 校验 Dealer
export const validateDealerCheck = (
  sapData: string | undefined,
  scheduledDealer: string | undefined,
  reallocatedTo: string | undefined
): string => {
  if (
    sapData &&
    scheduledDealer &&
    reallocatedTo &&
    sapData === scheduledDealer &&
    scheduledDealer === reallocatedTo
  ) {
    return "OK";
  }
  if (sapData && scheduledDealer && sapData === scheduledDealer && !reallocatedTo) {
    return "OK";
  }
  return "Mismatch";
};

// 处理 Reallocation
export const processReallocationData = (
  reallocationData: ReallocationData,
  scheduleData: ScheduleData
): ProcessedReallocationEntry[] => {
  const processed: ProcessedReallocationEntry[] = [];

  const chassisToRegentProduction = new Map<string, string>();
  scheduleData.forEach((entry) => {
    chassisToRegentProduction.set(entry.Chassis, entry["Regent Production"]);
  });

  Object.entries(reallocationData).forEach(([chassisNumber, entries]) => {
    const entryIds = Object.keys(entries);
    if (entryIds.length === 0) return;

    const latestEntryId = entryIds.reduce((latest, current) => {
      const latestDate = parseDDMMYYYY(
        entries[latest].date || entries[latest].submitTime
      );
      const currentDate = parseDDMMYYYY(
        entries[current].date || entries[current].submitTime
      );
      return currentDate > latestDate ? current : latest;
    });

    const latestEntry = entries[latestEntryId];
    const regentProduction = chassisToRegentProduction.get(chassisNumber);
    if (regentProduction === "Finished") return;

    processed.push({
      ...latestEntry,
      chassisNumber,
      entryId: latestEntryId,
      regentProduction: regentProduction || "N/A",
    });
  });

  return processed;
};

// 处理 Dispatch
export const processDispatchData = (
  dispatchData: DispatchData,
  reallocationData: ReallocationData
): ProcessedDispatchEntry[] => {
  const processed: ProcessedDispatchEntry[] = [];

  const chassisToReallocatedTo = new Map<string, string>();
  Object.entries(reallocationData).forEach(([chassisNumber, entries]) => {
    const entryIds = Object.keys(entries);
    if (entryIds.length > 0) {
      const latestEntryId = entryIds.reduce((latest, current) => {
        const latestDate = parseDDMMYYYY(
          entries[latest].date || entries[latest].submitTime
        );
        const currentDate = parseDDMMYYYY(
          entries[current].date || entries[current].submitTime
        );
        return currentDate > latestDate ? current : latest;
      });
      chassisToReallocatedTo.set(
        chassisNumber,
        entries[latestEntryId].reallocatedTo
      );
    }
  });

  Object.entries(dispatchData).forEach(([chassisNo, entry]) => {
    const reallocatedTo = chassisToReallocatedTo.get(chassisNo);
    const validatedDealerCheck = validateDealerCheck(
      entry["SAP Data"],
      entry["Scheduled Dealer"],
      reallocatedTo
    );

    processed.push({
      ...entry,
      DealerCheck: validatedDealerCheck,
      ...(reallocatedTo && { reallocatedTo }),
    });
  });

  return processed;
};

// Snowy Stock 判断
const isSnowyStock = (
  entry: ProcessedDispatchEntry,
  chassisToReallocatedTo: Map<string, string>
) => {
  const reallocatedTo = chassisToReallocatedTo.get(entry["Chassis No"]);
  if (reallocatedTo === "Snowy Stock") return true;
  return (
    entry["Scheduled Dealer"] === "Snowy Stock" &&
    entry.Statuscheck === "OK" &&
    entry.DealerCheck === "OK" &&
    (!reallocatedTo || reallocatedTo.trim() === "")
  );
};

// 顶部统计
export const getDispatchStats = (
  dispatchData: DispatchData,
  reallocationData: ReallocationData
) => {
  const entries = Object.values(dispatchData);
  const total = entries.length;
  const okStatus = entries.filter((e) => e.Statuscheck === "OK").length;
  const invalidStock = entries.filter((e) => e.Statuscheck !== "OK").length;

  const chassisToReallocatedTo = new Map<string, string>();
  Object.entries(reallocationData).forEach(([chassisNumber, entryObj]) => {
    const ids = Object.keys(entryObj);
    if (ids.length > 0) {
      const latestId = ids.reduce((latest, current) => {
        const latestDate = parseDDMMYYYY(
          entryObj[latest].date || entryObj[latest].submitTime
        );
        const currentDate = parseDDMMYYYY(
          entryObj[current].date || entryObj[current].submitTime
        );
        return currentDate > latestDate ? current : latest;
      });
      chassisToReallocatedTo.set(chassisNumber, entryObj[latestId].reallocatedTo);
    }
  });

  const processedEntries = entries.map((e) => {
    const reallocatedTo = chassisToReallocatedTo.get(e["Chassis No"]);
    const validatedDealerCheck = validateDealerCheck(
      e["SAP Data"],
      e["Scheduled Dealer"],
      reallocatedTo
    );
    return { ...e, DealerCheck: validatedDealerCheck, reallocatedTo };
  });

  const snowyStock = processedEntries.filter((e) =>
    isSnowyStock(e, chassisToReallocatedTo)
  ).length;

  const canBeDispatched = processedEntries.filter(
    (e) => e.Statuscheck === "OK" && !isSnowyStock(e, chassisToReallocatedTo)
  ).length;

  return { total, okStatus, invalidStock, snowyStock, canBeDispatched };
};

// 过滤
export const filterDispatchData = (
  data: ProcessedDispatchEntry[],
  filter: string,
  reallocationData: ReallocationData
): ProcessedDispatchEntry[] => {
  if (filter === "all") return data;
  if (filter === "ok") return data.filter((e) => e.Statuscheck === "OK");
  if (filter === "invalid") return data.filter((e) => e.Statuscheck !== "OK");

  const chassisToReallocatedTo = new Map<string, string>();
  Object.entries(reallocationData).forEach(([chassisNumber, entryObj]) => {
    const ids = Object.keys(entryObj);
    if (ids.length > 0) {
      const latestId = ids.reduce((latest, current) => {
        const latestDate = parseDDMMYYYY(
          entryObj[latest].date || entryObj[latest].submitTime
        );
        const currentDate = parseDDMMYYYY(
          entryObj[current].date || entryObj[current].submitTime
        );
        return currentDate > latestDate ? current : latest;
      });
      chassisToReallocatedTo.set(chassisNumber, entryObj[latestId].reallocatedTo);
    }
  });

  if (filter === "snowy")
    return data.filter((e) => isSnowyStock(e, chassisToReallocatedTo));

  if (filter === "canBeDispatched")
    return data.filter(
      (e) => e.Statuscheck === "OK" && !isSnowyStock(e, chassisToReallocatedTo)
    );

  return data;
};

// GR 天数条的样式工具（给 UI 用）
export const getGRDaysColor = (days: number): string => {
  if (days <= 7) return "bg-green-500";
  if (days <= 14) return "bg-yellow-500";
  if (days <= 30) return "bg-orange-500";
  return "bg-red-500";
};
export const getGRDaysWidth = (days: number, maxDays: number): number =>
  Math.min((days / Math.max(maxDays, 1)) * 100, 100);
