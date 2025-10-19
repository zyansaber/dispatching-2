import React, { useState, useEffect } from 'react';
import { DispatchStats, DispatchTable, ReallocationTable } from '@/components/DataTables';
import { 
  fetchDispatchData, 
  fetchReallocationData, 
  fetchScheduleData,
  processDispatchData,
  processReallocationData,
  getDispatchStats,
  filterDispatchData
} from '@/lib/firebase';
import { ProcessedDispatchEntry, ProcessedReallocationEntry } from '@/types';
import { toast } from 'sonner';

const Index = () => {
  const [dispatchData, setDispatchData] = useState<ProcessedDispatchEntry[]>([]);
  const [reallocationData, setReallocationData] = useState<ProcessedReallocationEntry[]>([]);
  const [filteredDispatchData, setFilteredDispatchData] = useState<ProcessedDispatchEntry[]>([]);
  const [dispatchSearchTerm, setDispatchSearchTerm] = useState('');
  const [reallocationSearchTerm, setReallocationSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    okStatus: 0,
    invalidStock: 0,
    snowyStock: 0,
    canBeDispatched: 0
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [rawDispatchData, rawReallocationData, scheduleData] = await Promise.all([
        fetchDispatchData(),
        fetchReallocationData(),
        fetchScheduleData()
      ]);

      const processedDispatch = processDispatchData(rawDispatchData, rawReallocationData);
      const processedReallocation = processReallocationData(rawReallocationData, scheduleData);
      
      setDispatchData(processedDispatch);
      setReallocationData(processedReallocation);
      
      const dispatchStats = getDispatchStats(rawDispatchData, rawReallocationData);
      setStats(dispatchStats);
      
      // Apply initial filter
      const filtered = filterDispatchData(processedDispatch, activeFilter, rawReallocationData);
      setFilteredDispatchData(filtered);
      
      toast.success('Data loaded successfully');
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFilterChange = async (filter: string) => {
    setActiveFilter(filter);
    try {
      const rawReallocationData = await fetchReallocationData();
      const filtered = filterDispatchData(dispatchData, filter, rawReallocationData);
      setFilteredDispatchData(filtered);
    } catch (error) {
      console.error('Error applying filter:', error);
      toast.error('Failed to apply filter');
    }
  };

  const handleRefresh = () => {
    loadData();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dispatch Dashboard</h1>
          <p className="text-gray-600">SAP Data / Reallocation Data / Schedule Data</p>
        </div>

       <DispatchStats
         total={stats.total}
         invalidStock={stats.invalidStock}
         snowyStock={stats.snowyStock}
         canBeDispatched={stats.canBeDispatched}
         onHold={stats.onHold}            // ✅ 新增
         activeFilter={filter}
         onFilterChange={setFilter}
         onRefresh={refresh}
       />


        <DispatchTable
          data={filteredDispatchData}
          searchTerm={dispatchSearchTerm}
          onSearchChange={setDispatchSearchTerm}
          filter={activeFilter}
          allData={dispatchData}
          reallocationData={reallocationData}
        />

        <ReallocationTable
          data={reallocationData}
          searchTerm={reallocationSearchTerm}
          onSearchChange={setReallocationSearchTerm}
          dispatchData={dispatchData}
        />
      </div>
    </div>
  );
};

export default Index;
