
export function myTimestamp(date: string | Date): string {
    date = new Date(date)    
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')

    const HH = String(date.getHours()).padStart(2, '0')
    const MM = String(date.getMinutes()).padStart(2, '0')

    return `${yyyy}-${mm}-${dd} ${HH}:${MM}`
}
