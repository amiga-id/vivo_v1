import { Routes, Route } from 'react-router-dom';
import ToastProvider from '@/components/Toast';

// Pages - akan diimport setelah konversi
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';

// Admin routes
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminAudit from './pages/admin/AdminAudit';
import AdminClients from './pages/admin/AdminClients';

// Finance routes
import FinanceLayout from './pages/finance/FinanceLayout';
import FinanceDashboard from './pages/finance/FinanceDashboard';
import FinanceReview from './pages/finance/FinanceReview';
import FinanceAudit from './pages/finance/FinanceAudit';
import FinanceVoucher from './pages/finance/FinanceVoucher';

// Lead routes
import LeadLayout from './pages/lead/LeadLayout';
import LeadDashboard from './pages/lead/LeadDashboard';
import LeadAudit from './pages/lead/LeadAudit';

// Support routes
import SupportLayout from './pages/support/SupportLayout';
import SupportDashboard from './pages/support/SupportDashboard';
import SupportUpload from './pages/support/SupportUpload';
import SupportAudit from './pages/support/SupportAudit';
import SupportVoucher from './pages/support/SupportVoucher';
import SupportFix from './pages/support/SupportFix';
import SupportClients from './pages/support/SupportClients';

function App() {
  return (
    <ToastProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Admin routes */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="clients" element={<AdminClients />} />
        </Route>

        {/* Finance routes */}
        <Route path="/finance" element={<FinanceLayout />}>
          <Route index element={<FinanceDashboard />} />
          <Route path="review/:id" element={<FinanceReview />} />
          <Route path="audit" element={<FinanceAudit />} />
          <Route path="voucher" element={<FinanceVoucher />} />
        </Route>

        {/* Lead routes */}
        <Route path="/lead" element={<LeadLayout />}>
          <Route index element={<LeadDashboard />} />
          <Route path="audit" element={<LeadAudit />} />
        </Route>

        {/* Support routes */}
        <Route path="/support" element={<SupportLayout />}>
          <Route index element={<SupportDashboard />} />
          <Route path="upload" element={<SupportUpload />} />
          <Route path="audit" element={<SupportAudit />} />
          <Route path="voucher" element={<SupportVoucher />} />
          <Route path="fix/:id" element={<SupportFix />} />
          <Route path="clients" element={<SupportClients />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}

export default App;
