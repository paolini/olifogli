import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';

export default function UsersSortIcon({ direction }: { direction?: number }) {
  if (direction === undefined) return <ChevronsUpDown size={16} />;
  if (direction > 0) return <ArrowUp size={16} />;
  return <ArrowDown size={16} />;
}
