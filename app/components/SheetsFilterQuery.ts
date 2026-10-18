import type { SetStateAction } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';

export function useSheetsFilterWithQuerystring(defaults: { schema?: string } = {}) {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();

    type Sort = { field: string, direction: number } | null;
    type ColumnFilters = Record<string, string>;
    // Read directly from the URL; mounting a tab must never rewrite its URL.
    const schemaFilter = searchParams.get('schemaFilter') || '';
    const distrettoFilter = searchParams.get('distrettoFilter') || '';
    const statoFilter = searchParams.get('statoFilter') || '';
    const sortField = searchParams.get('sortField');
    const sort: Sort = sortField ? { field: sortField, direction: Number(searchParams.get('sortDirection') || 1) } : null;
    const columnFilters: ColumnFilters = Object.fromEntries(Array.from(searchParams.entries())
        .filter(([key]) => key.startsWith('columnFilter_'))
        .map(([key, value]) => [key.slice('columnFilter_'.length), value]));

    function updateQuery(change: (params: URLSearchParams) => void) {
        const params = new URLSearchParams(searchParams.toString());
        change(params);
        if (params.toString() === searchParams.toString()) return;
        router.replace(`${pathname}${params.size ? '?' + params.toString() : ''}`, { scroll: false });
    }

    function setFilter(key: string, current: string, next: SetStateAction<string>) {
        const value = typeof next === 'function' ? next(current) : next;
        updateQuery(params => { if (value) params.set(key, value); else params.delete(key); });
    }

    function setColumnFilters(next: SetStateAction<ColumnFilters>) {
        const values = typeof next === 'function' ? next(columnFilters) : next;
        updateQuery(params => {
            for (const key of Array.from(params.keys())) if (key.startsWith('columnFilter_')) params.delete(key);
            for (const [key, value] of Object.entries(values)) if (value) params.set(`columnFilter_${key}`, value);
        });
    }

    function setSort(next: SetStateAction<Sort>) {
        const value = typeof next === 'function' ? next(sort) : next;
        updateQuery(params => {
            if (value?.field) {
                params.set('sortField', value.field);
                params.set('sortDirection', String(value.direction));
            } else {
                params.delete('sortField');
                params.delete('sortDirection');
            }
        });
    }

    // Oggetto compatibile con SheetsFilter
    const filterState = {
        schema: defaults.schema || '',
        schemaFilter,
        setSchemaFilter: (next: SetStateAction<string>) => setFilter('schemaFilter', schemaFilter, next),
        distrettoFilter,
        setDistrettoFilter: (next: SetStateAction<string>) => setFilter('distrettoFilter', distrettoFilter, next),
        statoFilter,
        setStatoFilter: (next: SetStateAction<string>) => setFilter('statoFilter', statoFilter, next),
    };

    return { filterState, columnFilters, setColumnFilters, sort, setSort };
}
