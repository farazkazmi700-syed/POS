import { useQuery, useQueryClient } from '@tanstack/react-query';
import { branchApi } from '../api';
import { useAuth } from '../store/auth';
import { useTenant } from '../hooks/useTenant';
import { useCart } from '../store/cart';
export default function BranchSwitcher() {
  const user = useAuth((state) => state.user);
  const active = useAuth((state) => state.activeBranchId);
  const { tenant } = useTenant();
  const client = useQueryClient();
  const branches = useQuery({ queryKey: ['branches'], queryFn: branchApi.list, enabled: !!user && !user.isDeveloper });
  if (!Array.isArray(branches.data) || !branches.data.length) return null;
  const available = branches.data.filter((branch) => branch.isActive);
  return <div className="mb-5 flex flex-wrap items-center gap-3 text-xs"><label htmlFor="active-branch" className="font-semibold">Branch</label><select id="active-branch" className="input max-w-64" value={active ?? available.find((branch) => branch._id === tenant?.defaultBranchId)?._id ?? available[0]?._id ?? ''} onChange={(event) => {
    if (useCart.getState().items.length && !window.confirm('Changing branches clears the current sale. Continue?')) return;
    useCart.setState({ items: [], held: [] }); useAuth.setState({ activeBranchId: event.target.value }); client.clear();
  }}>{available.map((branch) => <option key={branch._id} value={branch._id}>{branch.name} ({branch.code})</option>)}</select><span className="text-slate-500">{tenant?.deploymentMode ?? 'cloud'} mode</span></div>;
}
