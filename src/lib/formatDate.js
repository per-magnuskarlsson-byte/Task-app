export function formatDateTime(value) {
  if (!value) return null
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}
