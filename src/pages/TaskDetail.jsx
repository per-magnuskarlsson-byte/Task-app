import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { formatDateTime } from '../lib/formatDate'

const STATUSES = ['open', 'in_progress', 'done']
const CATEGORIES = [
  { value: 'process_definition', label: 'Process definition' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'other', label: 'Other' }
]

export default function TaskDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [task, setTask] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)

  async function loadTask() {
    const { data } = await supabase
      .from('tasks')
      .select(
        '*, assignee:assigned_to(id, full_name), creator:created_by(id, full_name), documents(id, title, category, file_path, uploader:uploaded_by(full_name))'
      )
      .eq('id', id)
      .maybeSingle()
    if (!data) {
      setNotFound(true)
    } else {
      setTask(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadTask()
    supabase
      .from('profiles')
      .select('id, full_name')
      .then(({ data }) => setProfiles(data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const canManageDocs = task && (isAdmin || task.assigned_to === user.id)

  async function updateTask(e) {
    e.preventDefault()
    const form = new FormData(e.target)
    const { error } = await supabase
      .from('tasks')
      .update({
        title: form.get('title'),
        description: form.get('description'),
        due_date: form.get('due_date') || null
      })
      .eq('id', task.id)
    if (!error) {
      setEditing(false)
      loadTask()
    }
  }

  async function updateStatus(status) {
    await supabase.from('tasks').update({ status }).eq('id', task.id)
    loadTask()
  }

  async function updateAssignee(assignedTo) {
    await supabase.from('tasks').update({ assigned_to: assignedTo || null }).eq('id', task.id)
    loadTask()
  }

  async function deleteTask() {
    if (!window.confirm(`Delete "${task.title}"? This can't be undone.`)) return
    setError(null)
    const { error: deleteError } = await supabase.from('tasks').delete().eq('id', task.id)
    if (deleteError) {
      setError(
        deleteError.code === '23503'
          ? 'This task still has documents linked to it — delete or relink them first.'
          : deleteError.message
      )
      return
    }
    navigate('/tasks')
  }

  async function openDocument(doc) {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.file_path, 60)
    if (!error) window.open(data.signedUrl, '_blank')
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
    loadTask()
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
        task_id: task.id,
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
    loadTask()
  }

  if (loading) return <p className="text-sm text-gray-500">Loading task…</p>
  if (notFound) {
    return (
      <div>
        <p className="text-sm text-gray-500">
          This task doesn't exist, or you don't have access to it.
        </p>
        <Link to="/tasks" className="mt-2 inline-block text-sm text-brand-900 hover:underline">
          ← Back to tasks
        </Link>
      </div>
    )
  }

  return (
    <div>
      <Link to="/tasks" className="mb-4 inline-block text-sm text-gray-500 hover:text-gray-900">
        ← Back to tasks
      </Link>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border bg-white p-4">
        {editing ? (
          <form onSubmit={updateTask} className="space-y-3">
            <input
              name="title"
              defaultValue={task.title}
              required
              className="w-full rounded-md border px-3 py-2 text-sm font-medium"
            />
            <textarea
              name="description"
              defaultValue={task.description ?? ''}
              placeholder="Description (optional)"
              className="w-full rounded-md border px-3 py-2 text-sm"
              rows={4}
            />
            <input name="due_date" type="date" defaultValue={task.due_date ?? ''} className="rounded-md border px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button type="submit" className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900">
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-md border px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-gray-900">{task.title}</h2>
              {isAdmin && (
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => setEditing(true)} className="text-xs font-medium text-brand-900 hover:underline">
                    Edit
                  </button>
                  <button onClick={deleteTask} className="text-xs font-medium text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
              )}
            </div>
            {task.description && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{task.description}</p>}
            {task.due_date && <p className="mt-2 text-xs text-gray-400">Due {task.due_date}</p>}
          </>
        )}

        <p className="mt-2 text-xs text-gray-400">
          Created {formatDateTime(task.created_at)} · Last updated {formatDateTime(task.updated_at)}
        </p>

        <div className="mt-4 flex flex-wrap gap-3 border-t pt-4">
          <label className="flex items-center gap-2 text-xs text-gray-500">
            Assignee
            {isAdmin ? (
              <select
                value={task.assigned_to ?? ''}
                onChange={(e) => updateAssignee(e.target.value)}
                className="rounded-md border px-2 py-1 text-xs"
              >
                <option value="">Unassigned</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-medium text-gray-700">{task.assignee?.full_name ?? 'Unassigned'}</span>
            )}
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            Status
            <select
              value={task.status}
              onChange={(e) => updateStatus(e.target.value)}
              className="rounded-md border px-2 py-1 text-xs"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Documents</h3>

        {task.documents?.length > 0 ? (
          <ul className="mb-4 space-y-1.5">
            {task.documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <button onClick={() => openDocument(doc)} className="text-brand-900 hover:underline">
                    {doc.title}
                  </button>
                  <p className="text-xs text-gray-400">
                    {CATEGORIES.find((c) => c.value === doc.category)?.label} · uploaded by{' '}
                    {doc.uploader?.full_name ?? 'someone'}
                  </p>
                </div>
                {canManageDocs && (
                  <button onClick={() => deleteDocument(doc)} className="text-xs font-medium text-red-600 hover:underline">
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-gray-500">No documents on this task yet.</p>
        )}

        {canManageDocs && (
          <form onSubmit={handleUpload} className="space-y-2 rounded-md bg-gray-50 p-3">
            <input
              name="title"
              placeholder="Title (optional, ignored for multi-file uploads)"
              className="w-full rounded-md border px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <select name="category" className="rounded-md border px-2 py-1.5 text-sm">
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input name="file" type="file" multiple required className="flex-1 text-sm" />
            </div>
            <button
              type="submit"
              disabled={uploading}
              className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900 disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload document(s)'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
