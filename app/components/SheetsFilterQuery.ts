import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';

type Sort = { field: string, direction: number } | null;
type ColumnFilters = Record<string, string>;

const COLUMN_FILTER_PREFIX = 'columnFilter_';
// Attesa prima di scrivere i filtri per colonna nell'URL mentre si digita.
const COLUMN_FILTERS_DEBOUNCE_MS = 300;

function readColumnFilters(params: URLSearchParams): ColumnFilters {
    return Object.fromEntries(Array.from(params.entries())
        .filter(([key]) => key.startsWith(COLUMN_FILTER_PREFIX))
        .map(([key, value]) => [key.slice(COLUMN_FILTER_PREFIX.length), value]));
}

function columnFiltersKey(filters: ColumnFilters): string {
    return JSON.stringify(Object.entries(filters).filter(([, value]) => value).sort());
}

export function useSheetsFilterWithQuerystring(defaults: { schema?: string } = {}) {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();

    // Read directly from the URL; mounting a tab must never rewrite its URL.
    const schemaFilter = searchParams.get('schemaFilter') || '';
    const distrettoFilter = searchParams.get('distrettoFilter') || '';
    const statoFilter = searchParams.get('statoFilter') || '';
    const sortField = searchParams.get('sortField');
    const sort: Sort = sortField ? { field: sortField, direction: Number(searchParams.get('sortDirection') || 1) } : null;
    const urlColumnFilters = readColumnFilters(searchParams);
    const urlColumnFiltersKey = columnFiltersKey(urlColumnFilters);

    // While typing, column filters live in a local draft: the URL is updated
    // asynchronously, so reading the input value from it would drop keystrokes.
    // `flushedFrom` is the URL key when the draft was written to the URL: once
    // the URL changes from it (our write, or a navigation) the URL wins again.
    const [draft, setDraft] = useState<{ values: ColumnFilters, flushedFrom: string | null } | null>(null);
    if (draft && draft.flushedFrom !== null && draft.flushedFrom !== urlColumnFiltersKey) setDraft(null);
    const columnFilters = draft?.values ?? urlColumnFilters;
    const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (flushTimer.current) clearTimeout(flushTimer.current); }, []);
    // The debounced write must start from the latest URL: other parameters may
    // have changed while the user was typing.
    const latestSearchParams = useRef(searchParams);
    useEffect(() => { latestSearchParams.current = searchParams; }, [searchParams]);

    function replaceQuery(current: URLSearchParams, change: (params: URLSearchParams) => void) {
        const params = new URLSearchParams(current.toString());
        change(params);
        if (params.toString() === current.toString()) return;
        router.replace(`${pathname}${params.size ? '?' + params.toString() : ''}`, { scroll: false });
    }

    function updateQuery(change: (params: URLSearchParams) => void) {
        replaceQuery(searchParams, change);
    }

    function setFilter(key: string, current: string, next: SetStateAction<string>) {
        const value = typeof next === 'function' ? next(current) : next;
        updateQuery(params => { if (value) params.set(key, value); else params.delete(key); });
    }

    function setColumnFilters(next: SetStateAction<ColumnFilters>) {
        const values = typeof next === 'function' ? next(columnFilters) : next;
        setDraft({ values, flushedFrom: null });
        if (flushTimer.current) clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(() => {
            flushTimer.current = null;
            const current = latestSearchParams.current;
            const currentKey = columnFiltersKey(readColumnFilters(current));
            if (currentKey === columnFiltersKey(values)) {
                setDraft(null);
                return;
            }
            setDraft({ values, flushedFrom: currentKey });
            replaceQuery(current, params => {
                for (const key of Array.from(params.keys())) if (key.startsWith(COLUMN_FILTER_PREFIX)) params.delete(key);
                for (const [key, value] of Object.entries(values)) if (value) params.set(`${COLUMN_FILTER_PREFIX}${key}`, value);
            });
        }, COLUMN_FILTERS_DEBOUNCE_MS);
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
