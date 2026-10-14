import { useSearchParams } from 'react-router-dom';
import { useSession } from '@/lib/session';
import * as api from '@/lib/api';
import VoucherView from '@/components/VoucherView';
import { Empty } from '@/components/ui';

export default function PicVoucher() {
  const { user, loading } = useSession();
  const [sp] = useSearchParams();
  if (loading || !user) return <div className="loading">Loading...</div>;

  try {
    const list = api.getVouchers(user);
    if (!list.length) return (
      <section className="card">
        <Empty title="Belum ada voucher">
          Voucher muncul di sini setelah Finance menyetujui dokumen Anda.
        </Empty>
      </section>
    );
    const id   = sp.get('id') ?? list[0].id;
    const pick = list.find(x => x.id === id) ?? list[0];
    const v    = api.getVoucher(user, pick.id);
    return <VoucherView user={user} list={list} v={v} base="/pic/voucher" />;
  } catch (e) {
    return <section className="card"><Empty title="Kesalahan">{(e as Error).message}</Empty></section>;
  }
}
