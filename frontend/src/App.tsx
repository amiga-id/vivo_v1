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

/* ── Support ── */
import SupportLayout    from './pages/support/SupportLayout';
import SupportDashboard from './pages/support/SupportDashboard';
import SupportUpload    from './pages/support/SupportUpload';
import SupportAudit     from './pages/support/SupportAudit';
import SupportVoucher   from './pages/support/SupportVoucher';
import SupportFix       from './pages/support/SupportFix';
import SupportClients   from './pages/support/SupportClients';
import SupportTax       from './pages/support/SupportTax';

/* ── PIC Klien ── */
import PicLayout    from './pages/pic/PicLayout';
import PicDashboard from './pages/pic/PicDashboard';
import PicUpload    from './pages/pic/PicUpload';
import PicVoucher   from './pages/pic/PicVoucher';
import PicAudit     from './pages/pic/PicAudit';
import PicTax       from './pages/pic/PicTax';
import PicFix       from './pages/pic/PicFix';

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        {/* Public */}
        <Route path="/"      element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* PIC Klien */}
        <Route path="/pic" element={<PicLayout />}>
          <Route index             element={<PicDashboard />} />
          <Route path="upload"     element={<PicUpload />} />
          <Route path="voucher"    element={<PicVoucher />} />
          <Route path="audit"      element={<PicAudit />} />
          <Route path="tax/:id"    element={<PicTax />} />
          <Route path="fix/:id"    element={<PicFix />} />
        </Route>

        {/* Intake Support */}
        <Route path="/support" element={<SupportLayout />}>
          <Route index             element={<SupportDashboard />} />
          <Route path="upload"     element={<SupportUpload />} />
          <Route path="voucher"    element={<SupportVoucher />} />
          <Route path="audit"      element={<SupportAudit />} />
          <Route path="clients"    element={<SupportClients />} />
          <Route path="fix/:id"    element={<SupportFix />} />
          <Route path="tax/:id"    element={<SupportTax />} />
        </Route>

        {/* Finance Reviewer */}
        <Route path="/finance" element={<FinanceLayout />}>
          <Route index             element={<FinanceDashboard />} />
          <Route path="review/:id" element={<FinanceReview />} />
          <Route path="voucher"    element={<FinanceVoucher />} />
          <Route path="audit"      element={<FinanceAudit />} />
        </Route>

        {/* Service Lead */}
        <Route path="/lead" element={<LeadLayout />}>
          <Route index         element={<LeadDashboard />} />
          <Route path="audit"  element={<LeadAudit />} />
        </Route>

        {/* System Admin */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index             element={<AdminDashboard />} />
          <Route path="users"      element={<AdminUsers />} />
          <Route path="clients"    element={<AdminClients />} />
          <Route path="audit"      element={<AdminAudit />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}
