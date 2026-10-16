import { Routes, Route } from 'react-router-dom';
import ToastProvider from '@/components/Toast';

import HomePage  from './pages/HomePage';
import LoginPage from './pages/LoginPage';

/* ── Admin ── */
import AdminLayout    from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers     from './pages/admin/AdminUsers';
import AdminAudit     from './pages/admin/AdminAudit';
import AdminClients   from './pages/admin/AdminClients';

/* ── Finance ── */
import FinanceLayout    from './pages/finance/FinanceLayout';
import FinanceDashboard from './pages/finance/FinanceDashboard';
import FinanceReview    from './pages/finance/FinanceReview';
import FinanceAudit     from './pages/finance/FinanceAudit';
import FinanceVoucher   from './pages/finance/FinanceVoucher';

/* ── Lead ── */
import LeadLayout    from './pages/lead/LeadLayout';
import LeadDashboard from './pages/lead/LeadDashboard';
import LeadAudit     from './pages/lead/LeadAudit';
import LeadAssign    from './pages/lead/LeadAssign';

/* ── Support (merged PIC + Support) ── */
import SupportLayout    from './pages/support/SupportLayout';
import SupportDashboard from './pages/support/SupportDashboard';
import SupportUpload    from './pages/support/SupportUpload';
import SupportVoucher   from './pages/support/SupportVoucher';
import SupportFix       from './pages/support/SupportFix';
import SupportTax       from './pages/support/SupportTax';

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/"      element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Support (was PIC + Support) */}
        <Route path="/support" element={<SupportLayout />}>
          <Route index           element={<SupportDashboard />} />
          <Route path="upload"   element={<SupportUpload />} />
          <Route path="voucher"  element={<SupportVoucher />} />
          <Route path="fix/:id"  element={<SupportFix />} />
          <Route path="tax/:id"  element={<SupportTax />} />
        </Route>

        {/* Finance */}
        <Route path="/finance" element={<FinanceLayout />}>
          <Route index             element={<FinanceDashboard />} />
          <Route path="review/:id" element={<FinanceReview />} />
          <Route path="voucher"    element={<FinanceVoucher />} />
          <Route path="audit"      element={<FinanceAudit />} />
        </Route>

        {/* Lead – workload + assign */}
        <Route path="/lead" element={<LeadLayout />}>
          <Route index         element={<LeadDashboard />} />
          <Route path="assign" element={<LeadAssign />} />
          <Route path="audit"  element={<LeadAudit />} />
        </Route>

        {/* Admin */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index           element={<AdminDashboard />} />
          <Route path="users"    element={<AdminUsers />} />
          <Route path="clients"  element={<AdminClients />} />
          <Route path="audit"    element={<AdminAudit />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}
