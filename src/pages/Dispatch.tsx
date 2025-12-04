import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StockSheetTable from '@/components/StockSheetTable';
import { DispatchStats, DispatchTable, ReallocationTable } from '@/components/DataTables';
import {
  deleteDispatchingNote,
  patchDispatchingNote,
  filterDispatchData,
} from '@/lib/firebase';
import { useDispatchData } from '@/hooks/use-dispatch-data';
import { DispatchingNoteData } from '@/types';
import { useDashboardContext } from '@/components/AppLayout';

const DispatchPage: React.FC = () => {
  const { dealer } = useDashboardContext();
  const { loading, dispatchingNote, schedule, reallocRaw, dispatchProcessed, reallocProcessed, stats } = useDispatchData();

  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'invalid' | 'snowy' | 'canBeDispatched' | 'onHold'>('all');
  const [showReallocation, setShowReallocation] = useState(false);
  const [activeTab, setActiveTab] = useState<'stock' | 'dispatch'>('stock');

  const filteredDispatch = useMemo(
    () => filterDispatchData(dispatchProcessed, activeFilter).filter((entry) =>
      Object.values(entry).some((value) =>
        String(value).toLowerCase().includes(search.toLowerCase()),
      ),
    ),
    [dispatchProcessed, activeFilter, search],
  );

  const handleSaveDispatchingNote = async (
    chassisNo: string,
    patch: Partial<DispatchingNoteData[string]>,
  ) => {
    const clean = chassisNo.trim();
    if (!clean) return;
    await patchDispatchingNote(clean, { chassisNo: clean, ...patch });
  };

  const handleDeleteDispatchingNote = async (chassisNo: string) => {
    const clean = chassisNo.trim();
    if (!clean) return;
    await deleteDispatchingNote(clean);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{dealer} · realtime dispatch workspace</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dispatch</h1>
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
            onDelete={handleDeleteDispatchingNote}
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
            onRefresh={() => {}}
          />

          <DispatchTable
            allData={filteredDispatch}
            activeFilter={activeFilter}
            searchTerm={search}
            onSearchChange={setSearch}
            reallocationData={reallocProcessed}
          />

          <div className="pt-2">
            <Button variant="outline" onClick={() => setShowReallocation((s) => !s)}>
              {showReallocation ? 'Hide Reallocation' : 'Show Reallocation'}
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

      {loading && <div className="text-sm text-muted-foreground">Loading live data...</div>}
    </div>
  );
};

export default DispatchPage;
