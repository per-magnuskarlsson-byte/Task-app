import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

const CATEGORIES = [
  { value: 'process_definition', label: 'Process definition' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'other', label: 'Other' }
]

export default function Documents() {
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [documents, setDocuments] = useState([])
  const [tasks, setTasks] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  async function loadData() {
    const [{ data: docData }, { data: taskData }] = await Promise.all([
      supabase
        .from('documents')
        .select('*, uploader:uploaded_by(full_name), task:task_id(id, title, assigned_to)')
        .order('created_at', { ascending: false }),
      supabase.from('tasks').select('id, title').order('created_at', { ascending: false })
    ])
    setDocuments(docData ?? [])
    setTasks(taskData ?? [])
  }

  useEffect(() => {
    loadData()
  }, [])

  function canManage(doc) {
    return isAdmin || doc.task?.assigned_to === user.id
  }

  async function handleUpload(e) {
    e.preventDefault()
    setError(null)
    const form = new FormData(e.target)
    const files = form.getAll('file').filter((f) => f instanceof File && f.size > 0)
    if (files.length === 0) {
      setError('Choose at least one file.')
      return
    }
    const taskId = form.get('task_id')
    if (!taskId) {
      setError('Every document must be linked to a task — pick one.')
      return
    }
    const title = form.get('title')
    const category = form.get('category')

    setUploading(true)
    for (const file of files) {
      const path = `${user.id}/${Date.now()}-${file.name}`

      const { error: uploadError } = await supabase.storage.from('documents').upload(path, file)
      if (uploadError) {
        setError(`${file.name}: ${uploadError.message}`)
        break
      }

      const { error: insertError } = await supabase.from('documents').insert({
        title: files.length === 1 ? title || file.name : file.name,
        category,
        task_id: taskId,
        file_path: path,
        file_name: file.name,
        uploaded_by: user.id
      })
      if (insertError) {
        setError(`${file.name}: ${insertError.message}`)
        break
      }
    }

    setUploading(false)
    e.target.reset()
    loadData()
  }

  async function openDocument(doc) {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.file_path, 60)
    if (!error) window.open(data.signedUrl, '_blank')
  }

  async function relinkDocument(docId, taskId) {
    if (!taskId) return // a document must always stay linked to some task
    await supabase.from('documents').update({ task_id: taskId }).eq('id', docId)
    loadData()
  }

  async function deleteDocument(doc) {
    if (!window.confirm(`Delete "${doc.title}"? This can't be undone.`)) return
    setError(null)
    const { error: storageError } = await supabase.storage.from('documents').remove([doc.file_path])
    if (storageError) {
      setError(storageError.message)
      return
    }
    const { error: deleteError } = await supabase.from('documents').delete().eq('id', doc.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    loadData()
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Documents</h2>

      {tasks.length === 0 ? (
        <p className="mb-6 rounded-lg border bg-white p-4 text-sm text-gray-500">
          Every document has to be linked to a task. {isAdmin ? 'Create a task first, then come back here to upload.' : 'You have no assigned tasks yet.'}
        </p>
      ) : (
        <form onSubmit={handleUpload} className="mb-6 space-y-3 rounded-lg border bg-white p-4">
          <input name="title" placeholder="Document title (optional, ignored for multi-file uploads)" className="w-full rounded-md border px-3 py-2 text-sm" />
          <div className="flex gap-3">
            <select name="category" className="rounded-md border px-3 py-2 text-sm">
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select name="task_id" required defaultValue="" className="flex-1 rounded-md border px-3 py-2 text-sm">
              <option value="" disabled>
                Link to task…
              </option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <input name="file" type="file" multiple className="w-full text-sm" required />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={uploading}
            className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Upload document(s)'}
          </button>
        </form>
      )}

      <ul className="space-y-2">
        {documents.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between gap-4 rounded-lg border bg-white p-4">
            <div>
              <button onClick={() => openDocument(doc)} className="font-medium text-brand-900 hover:underline">
                {doc.title}
              </button>
              <p className="mt-1 text-xs text-gray-400">
                {CATEGORIES.find((c) => c.value === doc.category)?.label} · uploaded by{' '}
                {doc.uploader?.full_name ?? 'someone'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isAdmin ? (
                <select
                  value={doc.task_id}
                  onChange={(e) => relinkDocument(doc.id, e.target.value)}
                  className="rounded-md border px-2 py-1 text-xs"
                >
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-gray-500">{doc.task?.title}</span>
              )}
              {canManage(doc) && (
                <button onClick={() => deleteDocument(doc)} className="text-xs font-medium text-red-600 hover:underline">
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
        {documents.length === 0 && <p className="text-sm text-gray-500">No documents yet.</p>}
      </ul>
    </div>
  )
}
