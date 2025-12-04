import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import AppLayout from '@/components/AppLayout';
import DashboardPage from '@/pages/Dashboard';
import DispatchPage from '@/pages/Dispatch';
import FinancePage from '@/pages/Finance';
import InventoryPage from '@/pages/Inventory';
import LoginPage from '@/pages/Login';
import NotFound from '@/pages/NotFound';
import ReportsPage from '@/pages/Reports';
import YardPage from '@/pages/Yard';

const App = () => (
  <TooltipProvider delayDuration={100}>
    <Toaster richColors closeButton />
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dispatch" replace />} />
          <Route path="/dispatch" element={<DispatchPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/yard" element={<YardPage />} />
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
