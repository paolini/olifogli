
export function myTimestamp(date: string | Date | undefined | null): string {
    if (date === undefined || date === null) return '???'
    date = new Date(date)    
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')

    const HH = String(date.getHours()).padStart(2, '0')
    const MM = String(date.getMinutes()).padStart(2, '0')

    return `${yyyy}-${mm}-${dd} ${HH}:${MM}`
}

export function pluralize(count: number, singular: string, plural: string): string {
    if (plural.includes('%')) {
        return count === 1 
            ? singular.replace('%', '1')
            : plural.replace('%', String(count));
    }
    return count === 1 ? `${count} ${singular}` : `${count} ${plural}`;
}