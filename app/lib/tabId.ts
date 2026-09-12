// Returns a stable UUID for the current browser tab (in-memory only, not persisted).
// A new UUID is generated on every fresh page load / tab open / tab duplication.
// Returns 'ssr' during server-side rendering.
let _tabId: string | null = null

export function getTabId(): string {
    if (typeof window === 'undefined') return 'ssr'
    if (!_tabId) {
        _tabId = crypto.randomUUID()
    }
    return _tabId
}
