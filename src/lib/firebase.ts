// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  get,
  push,
  update,
  onValue,
  off,
} from "firebase/database";
import {
  ReallocationData,
  DispatchData,
  ScheduleData,
  ProcessedReallocationEntry,
  ProcessedDispatchEntry,
  DispatchingNoteData,
  DispatchingNoteEntry,
} from "@/types";

// -------------------- Firebase 初始化 --------------------
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
export const db = getDatabase(app);

// -------------------- 工具函数 --------------------
function escapeKey(key: string) {
  return key.replace(/[.#$\[\]\/]/g, "_");
}

// /Dispatch/<Chassis No> 的引用
export function dispatchRef(chassisNo: string) {
  return ref(db, `Dispatch/${escapeKey(chassisNo)}`);
}

// /dispatchingnote/<Chassis No> 的引用
export function dispatchingNoteRef(chassisNo: string) {
  return ref(db, `dispatchingnote/${escapeKey(chassisNo)}`);
}

// 按底盘号进行“局部更新”
export async function patchDispatch(
  chassisNo: string,
  data: Record<string, any>
) {
  await update(dispatchRef(chassisNo), data);
}

// 按底盘号进行“局部更新” dispatching note
export async function patchDispatchingNote(
  chassisNo: string,
  data: Partial<DispatchingNoteEntry>
) {
  await update(dispatchingNoteRef(chassisNo), data);
}

// DD/MM/YYYY 解析
const parseDDMMYYYY = (dateString: string | undefined): Date => {
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
  ) {
    return new Date(0);
  }
  return new Date(year, month, day);
};

// -------------------- 数据读取 --------------------
export const fetchReallocationData = async (): Promise<ReallocationData> => {
  try {
    const snapshot = await get(ref(db, "reallocation"));
    return snapshot.val() || {};
  } catch (error) {
    console.error("Error fetching reallocation data:", error);
    return {};
  }
};

export const fetchDispatchData = async (): Promise<DispatchData> => {
  try {
    const snapshot = await get(ref(db, "Dispatch"));
    return snapshot.val() || {};
  } catch (error) {
    console.error("Error fetching dispatch data:", error);
    return {};
  }
};

export const fetchScheduleData = async (): Promise<ScheduleData> => {
  try {
    const snapshot = await get(ref(db, "schedule"));
    return snapshot.val() || [];
  } catch (error) {
    console.error("Error fetching schedule data:", error);
    return [];
  }
};

export const fetchDispatchingNoteData = async (): Promise<DispatchingNoteData> => {
  try {
    const snapshot = await get(ref(db, "dispatchingnote"));
    return snapshot.val() || {};
  } catch (error) {
    console.error("Error fetching dispatching note data:", error);
    return {};
  }
};

// -------------------- 实时订阅 --------------------
export function subscribeDispatch(onChange: (data: DispatchData) => void) {
  const r = ref(db, "Dispatch");
  const cb = onValue(r, (snap) => onChange((snap.val() || {}) as DispatchData));
  return () => off(r, "value", cb);
}

export function subscribeReallocation(onChange: (data: ReallocationData) => void) {
  const r = ref(db, "reallocation");
  const cb = onValue(r, (snap) =>
    onChange((snap.val() || {}) as ReallocationData)
  );
  return () => off(r, "value", cb);
}

export function subscribeDispatchingNote(
  onChange: (data: DispatchingNoteData) => void
) {
  const r = ref(db, "dispatchingnote");
  const cb = onValue(r, (snap) =>
    onChange((snap.val() || {}) as DispatchingNoteData)
  );
  return () => off(r, "value", cb);
}

// -------------------- 业务辅助 --------------------
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
    await push(ref(db, "dispatchError"), errorData);
    return true;
  } catch (error) {
    console.error("Error reporting error:", error);
    return false;
  }
};

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
    if (!entryIds.length) return;

    const latestEntryId = entryIds.reduce((latest, current) => {
      const latestDate = parseDDMMYYYY(entries[latest].date || entries[latest].submitTime);
      const currentDate = parseDDMMYYYY(entries[current].date || entries[current].submitTime);
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
  )
    return "OK";

  if (sapData && scheduledDealer && sapData === scheduledDealer && !reallocatedTo)
    return "OK";

  return "Mismatch";
};

export const processDispatchData = (
  dispatchData: DispatchData,
  reallocationData: ReallocationData
): ProcessedDispatchEntry[] => {
  const processed: ProcessedDispatchEntry[] = [];

  const chassisToReallocatedTo = new Map<string, string>();
  Object.entries(reallocationData).forEach(([chassisNumber, entries]) => {
    const entryIds = Object.keys(entries);
    if (!entryIds.length) return;

    const latestEntryId = entryIds.reduce((latest, current) => {
      const latestDate = parseDDMMYYYY(entries[latest].date || entries[latest].submitTime);
      const currentDate = parseDDMMYYYY(entries[current].date || entries[current].submitTime);
      return currentDate > latestDate ? current : latest;
    });

    chassisToReallocatedTo.set(
      chassisNumber,
      entries[latestEntryId].reallocatedTo || ""
    );
  });

  Object.entries(dispatchData).forEach(([chassisNo, entry]) => {
    const reallocatedTo = chassisToReallocatedTo.get(chassisNo);
    const validatedDealerCheck = validateDealerCheck(
      entry["SAP Data"],
      entry["Scheduled Dealer"],
      reallocatedTo
    );
    processed.push({
      "Chassis No": entry["Chassis No"] || chassisNo, // 注入主键，防止库里没存该字段时报错
      ...entry,
      DealerCheck: validatedDealerCheck,
      ...(reallocatedTo ? { reallocatedTo } : {}),
    });
  });

  return processed;
};

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

export const getDispatchStats = (
  dispatchData: DispatchData,
  reallocationData: ReallocationData
) => {
  const entries = Object.values(dispatchData);
  const total = entries.length;
  const okStatus = entries.filter((e) => e.Statuscheck === "OK").length;
  const invalidStock = entries.filter((e) => e.Statuscheck !== "OK").length;
  const onHold = entries.filter((e) => e.OnHold === true).length;

  const chassisToReallocatedTo = new Map<string, string>();
  Object.entries(reallocationData).forEach(([chassisNumber, entryObj]) => {
    const entryIds = Object.keys(entryObj);
    if (!entryIds.length) return;
    const latestEntryId = entryIds.reduce((latest, current) => {
      const latestDate = parseDDMMYYYY(entryObj[latest].date || entryObj[latest].submitTime);
      const currentDate = parseDDMMYYYY(entryObj[current].date || entryObj[current].submitTime);
      return currentDate > latestDate ? current : latest;
    });
    chassisToReallocatedTo.set(
      chassisNumber,
      entryObj[latestEntryId].reallocatedTo || ""
    );
  });

  const processedEntries = entries.map((entry) => {
    const reallocatedTo = chassisToReallocatedTo.get(entry["Chassis No"]);
    const validatedDealerCheck = validateDealerCheck(
      entry["SAP Data"],
      entry["Scheduled Dealer"],
      reallocatedTo
    );
    return { ...entry, DealerCheck: validatedDealerCheck, reallocatedTo };
  });

  const snowyStock = processedEntries.filter((e) =>
    isSnowyStock(e, chassisToReallocatedTo)
  ).length;
  const canBeDispatched = processedEntries.filter(
    (e) => e.Statuscheck === "OK" && !isSnowyStock(e, chassisToReallocatedTo)
  ).length;

  return {
    total,
    okStatus,
    invalidStock,
    snowyStock,
    canBeDispatched,
    onHold,
  };
};

export const filterDispatchData = (
  data: ProcessedDispatchEntry[],
  filter: string,
  reallocationData: ReallocationData
): ProcessedDispatchEntry[] => {
  if (filter === "all") return data;
  if (filter === "invalid") return data.filter((e) => e.Statuscheck !== "OK");
  if (filter === "onHold") return data.filter((e) => e.OnHold === true);

  const chassisToReallocatedTo = new Map<string, string>();
  Object.entries(reallocationData).forEach(([chassisNumber, entryObj]) => {
    const entryIds = Object.keys(entryObj);
    if (!entryIds.length) return;
    const latestEntryId = entryIds.reduce((latest, current) => {
      const latestDate = parseDDMMYYYY(entryObj[latest].date || entryObj[latest].submitTime);
      const currentDate = parseDDMMYYYY(entryObj[current].date || entryObj[current].submitTime);
      return currentDate > latestDate ? current : latest;
    });
    chassisToReallocatedTo.set(
      chassisNumber,
      entryObj[latestEntryId].reallocatedTo || ""
    );
  });

  if (filter === "snowy") {
    return data.filter(
      (e) =>
        e.reallocatedTo === "Snowy Stock" ||
        e["Scheduled Dealer"] === "Snowy Stock"
    );
  }
  if (filter === "canBeDispatched") {
    return data.filter(
      (e) =>
        e.Statuscheck === "OK" &&
        !(e.reallocatedTo === "Snowy Stock" ||
          e["Scheduled Dealer"] === "Snowy Stock")
    );
  }
  return data;
};

// -------------------- UI 色条辅助 --------------------
export const getGRDaysColor = (days: number): string => {
  if (days <= 7) return "bg-green-500";
  if (days <= 14) return "bg-yellow-500";
  if (days <= 30) return "bg-orange-500";
  return "bg-red-500";
};

export const getGRDaysWidth = (days: number, maxDays: number): number => {
  return Math.min((days / Math.max(maxDays, 1)) * 100, 100);
};
