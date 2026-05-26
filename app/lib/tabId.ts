// Returns a stable UUID for the current browser tab, persisted in sessionStorage.
// Returns 'ssr' during server-side rendering.
let _tabId: string | null = null

export function getTabId(): string {
    if (typeof window === 'undefined') return 'ssr'
    if (!_tabId) {
        const stored = sessionStorage.getItem('olifogli-tabId')
        if (stored) {
            _tabId = stored
        } else {
            _tabId = crypto.randomUUID()
            sessionStorage.setItem('olifogli-tabId', _tabId)
        }
    }
    return _tabId
}
