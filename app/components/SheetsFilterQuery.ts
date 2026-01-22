import { useState, useEffect } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';

export function useSheetsFilterWithQuerystring(defaults: { schema?: string } = {}) {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();

    // Stato filtri generali
    const [schemaFilter, setSchemaFilter] = useState('');
    const [distrettoFilter, setDistrettoFilter] = useState('');
    const [statoFilter, setStatoFilter] = useState('');
    // Stato filtro per colonne dinamiche
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
    // Stato ordinamento colonne
    const [sort, setSort] = useState<{ field: string, direction: number } | null>(null);

    // Lettura querystring all'avvio
    useEffect(() => {
        const sortField = searchParams.get('sortField');
        const sortDirection = searchParams.get('sortDirection');
        if (sortField) {
            setSort({ field: sortField, direction: sortDirection ? Number(sortDirection) : 1 });
        }
        const schemaFilterParam = searchParams.get('schemaFilter');
        if (schemaFilterParam !== null) setSchemaFilter(schemaFilterParam);
        const distrettoFilterParam = searchParams.get('distrettoFilter');
        if (distrettoFilterParam !== null) setDistrettoFilter(distrettoFilterParam);
        const statoFilterParam = searchParams.get('statoFilter');
        if (statoFilterParam !== null) setStatoFilter(statoFilterParam);
        const colFilters: Record<string, string> = {};
        for (const k of Array.from(searchParams.keys())) {
            if (k.startsWith('columnFilter_')) {
                const col = k.replace('columnFilter_', '');
                colFilters[col] = searchParams.get(k) || '';
            }
        }
        setColumnFilters(colFilters);
    }, [searchParams]);

    // Aggiorna querystring quando cambia uno degli stati
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (sort?.field) params.set('sortField', sort.field); else params.delete('sortField');
        if (sort?.direction !== undefined && sort?.field) params.set('sortDirection', String(sort.direction)); else params.delete('sortDirection');
        if (schemaFilter) params.set('schemaFilter', schemaFilter); else params.delete('schemaFilter');
        if (distrettoFilter) params.set('distrettoFilter', distrettoFilter); else params.delete('distrettoFilter');
        if (statoFilter) params.set('statoFilter', statoFilter); else params.delete('statoFilter');
        Object.keys(columnFilters).forEach(key => {
            if (columnFilters[key]) params.set(`columnFilter_${key}`, columnFilters[key]);
            else params.delete(`columnFilter_${key}`);
        });
        Array.from(params.keys()).forEach(k => {
            if (k.startsWith('columnFilter_') && !Object.keys(columnFilters).includes(k.replace('columnFilter_', ''))) {
                params.delete(k);
            }
        });
        const newUrl = pathname + '?' + params.toString();
        router.replace(newUrl);
    }, [sort, columnFilters, schemaFilter, distrettoFilter, statoFilter]);

    // Oggetto compatibile con SheetsFilter
    const filterState = {
        schema: defaults.schema || '',
        schemaFilter,
        setSchemaFilter,
        distrettoFilter,
        setDistrettoFilter,
        statoFilter,
        setStatoFilter
    };

    return { filterState, columnFilters, setColumnFilters, sort, setSort };
}
