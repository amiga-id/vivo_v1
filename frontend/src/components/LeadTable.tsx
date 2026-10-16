import type { LeadReviewer, LeadWorkloadRow } from '@/lib/lead-api';
import { usePagination } from '@/lib/pagination';
import Pagination from './Pagination';
import { Badge, Empty } from './ui';

const OPEN_STATUSES = ['Dalam Review', 'Dikembalikan', 'Diproses'];

export default function LeadTable({
  rows,
  reviewers,
  pendingId,
  onReassign,
}: {
  rows: LeadWorkloadRow[];
  reviewers: LeadReviewer[];
  pendingId: string | null;
  onReassign: (submissionId: string, reviewerId: string) => void;
}) {
  const pagination = usePagination(rows);

  return (
    <>
      {rows.length === 0 ? (
        <Empty title="Belum ada pengajuan">
          Pengajuan yang masuk akan muncul pada daftar beban kerja ini.
        </Empty>
      ) : (
        <>
          <div className="tblw">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Pengajuan</th>
                  <th>Jenis</th>
                  <th>Tenggat</th>
                  <th>Status</th>
                  <th>Penugasan</th>
                  <th>Reviewer</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map(row => {
                  const eligibleReviewers = reviewers.filter(
                    reviewer => reviewer.id !== row.uploader_id,
                  );
                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.request_number}</strong>
                        <div className="m">{row.client_name}</div>
                      </td>
                      <td>{row.kind}</td>
                      <td>{row.due_date}</td>
                      <td><Badge status={row.status} /></td>
                      <td>
                        {row.conflict
                          ? <span className="badge s-Konflik">Konflik penugasan</span>
                          : <span className="m">Aman</span>}
                      </td>
                      <td>
                        {OPEN_STATUSES.includes(row.status) ? (
                          <select
                            className="inline"
                            aria-label={`Alihkan reviewer ${row.request_number}`}
                            value={row.reviewer_id}
                            disabled={pendingId !== null || eligibleReviewers.length === 0}
                            onChange={event => onReassign(row.id, event.target.value)}
                          >
                            {row.conflict && (
                              <option value={row.reviewer_id} disabled>
                                {row.reviewer_name} (pengunggah)
                              </option>
                            )}
                            {eligibleReviewers.map(reviewer => (
                              <option key={reviewer.id} value={reviewer.id}>
                                {reviewer.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="m">Selesai</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={pagination.page}
            pageCount={pagination.pageCount}
            firstItem={pagination.firstItem}
            lastItem={pagination.lastItem}
            totalItems={rows.length}
            onPageChange={pagination.setPage}
          />
        </>
      )}
    </>
  );
}
