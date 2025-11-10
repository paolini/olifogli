import { Funnel } from 'lucide-react';

export default function FilterIcon({ active }: { active?: boolean }) {
  return <Funnel size={16} color={active ? '#2563eb' : '#888'} />;
}
