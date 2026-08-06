import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

const STATUSES = ['open', 'in_progress', 'done']
const CATEGORIES = [
  { value: 'process_definition', label: 'Process definition' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'other', label: 'Other' }
]

function TaskDocuments({ task, canManage, onChange }) {
  const { user } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  async function openDocument(doc) {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.file_path, 60)
    if (!error) window.open(data.signedUrl, '_blank')
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
    onChange()
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
    onChange()
  }

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      {task.documents?.length > 0 ? (
        <ul className="space-y-1.5">
          {task.documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 text-sm">
              <button onClick={() => openDocument(doc)} className="text-brand-900 hover:underline">
                {doc.title}
              </button>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{CATEGORIES.find((c) => c.value === doc.category)?.label}</span>
                {canManage && (
                  <button onClick={() => deleteDocument(doc)} className="font-medium text-red-600 hover:underline">
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">No documents on this task yet.</p>
      )}

      {canManage && (
        <form onSubmit={handleUpload} className="space-y-2 rounded-md bg-gray-50 p-3">
          <input name="title" placeholder="Title (optional, ignored for multi-file uploads)" className="w-full rounded-md border px-2 py-1.5 text-xs" />
          <div className="flex gap-2">
            <select name="category" className="rounded-md border px-2 py-1.5 text-xs">
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input name="file" type="file" multiple required className="flex-1 text-xs" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={uploading}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-900 disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Upload document(s)'}
          </button>
        </form>
      )}
    </div>
  )
}

export default function Tasks() {
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [docsTaskId, setDocsTaskId] = useState(null)
  const [error, setError] = useState(null)

  async function loadData() {
    setLoading(true)
    const [{ data: taskData }, { data: profileData }] = await Promise.all([
      supabase
        .from('tasks')
        .select(
          '*, assignee:assigned_to(id, full_name), creator:created_by(id, full_name), documents(id, title, category, file_path)'
        )
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name')
    ])
    setTasks(taskData ?? [])
    setProfiles(profileData ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  async function createTask(e) {
    e.preventDefault()
    const form = new FormData(e.target)
    const { error } = await supabase.from('tasks').insert({
      title: form.get('title'),
      description: form.get('description'),
      assigned_to: form.get('assigned_to') || null,
      due_date: form.get('due_date') || null,
      created_by: user.id
    })
    if (!error) {
      setShowForm(false)
      loadData()
    }
  }

  async function updateTask(e, taskId) {
    e.preventDefault()
    const form = new FormData(e.target)
    const { error } = await supabase
      .from('tasks')
      .update({
        title: form.get('title'),
        description: form.get('description'),
        due_date: form.get('due_date') || null
      })
      .eq('id', taskId)
    if (!error) {
      setEditingTaskId(null)
      loadData()
    }
  }

  async function updateStatus(taskId, status) {
    await supabase.from('tasks').update({ status }).eq('id', taskId)
    loadData()
  }

  async function updateAssignee(taskId, assignedTo) {
    await supabase.from('tasks').update({ assigned_to: assignedTo || null }).eq('id', taskId)
    loadData()
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete "${task.title}"? This can't be undone.`)) return
    setError(null)
    const { error: deleteError } = await supabase.from('tasks').delete().eq('id', task.id)
    if (deleteError) {
      setError(
        deleteError.code === '23503'
          ? `"${task.title}" still has documents linked to it — delete or relink them first.`
          : deleteError.message
      )
      return
    }
    loadData()
  }

  if (loading) return <p className="text-sm text-gray-500">Loading tasks…</p>

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Tasks</h2>
        {isAdmin && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900"
          >
            {showForm ? 'Cancel' : 'New task'}
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {isAdmin && showForm && (
        <form onSubmit={createTask} className="mb-6 space-y-3 rounded-lg border bg-white p-4">
          <input name="title" placeholder="Task title" required className="w-full rounded-md border px-3 py-2 text-sm" />
          <textarea
            name="description"
            placeholder="Description (optional)"
            className="w-full rounded-md border px-3 py-2 text-sm"
            rows={2}
          />
          <div className="flex gap-3">
            <select name="assigned_to" className="flex-1 rounded-md border px-3 py-2 text-sm">
              <option value="">Unassigned</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            <input name="due_date" type="date" className="rounded-md border px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900">
            Create task
          </button>
        </form>
      )}

      <ul className="space-y-2">
        {tasks.map((task) => {
          const canManageDocs = isAdmin || task.assigned_to === user.id

          return editingTaskId === task.id ? (
            <li key={task.id} className="rounded-lg border bg-white p-4">
              <form onSubmit={(e) => updateTask(e, task.id)} className="space-y-3">
                <input
                  name="title"
                  defaultValue={task.title}
                  required
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
                <textarea
                  name="description"
                  defaultValue={task.description ?? ''}
                  placeholder="Description (optional)"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  rows={2}
                />
                <input name="due_date" type="date" defaultValue={task.due_date ?? ''} className="rounded-md border px-3 py-2 text-sm" />
                <div className="flex gap-2">
                  <button type="submit" className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900">
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingTaskId(null)}
                    className="rounded-md border px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </li>
          ) : (
            <li key={task.id} className="rounded-lg border bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">{task.title}</p>
                  {task.description && <p className="mt-1 text-sm text-gray-500">{task.description}</p>}
                  {task.due_date && <p className="mt-2 text-xs text-gray-400">Due {task.due_date}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {isAdmin && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingTaskId(task.id)}
                        className="text-xs font-medium text-brand-900 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteTask(task)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                  {isAdmin ? (
                    <select
                      value={task.assigned_to ?? ''}
                      onChange={(e) => updateAssignee(task.id, e.target.value)}
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
                    <span className="text-xs text-gray-500">{task.assignee?.full_name ?? 'Unassigned'}</span>
                  )}
                  <select
                    value={task.status}
                    onChange={(e) => updateStatus(task.id, e.target.value)}
                    className="rounded-md border px-2 py-1 text-xs"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={() => setDocsTaskId(docsTaskId === task.id ? null : task.id)}
                className="mt-2 text-xs font-medium text-brand-900 hover:underline"
              >
                📎 {task.documents?.length ?? 0} document{task.documents?.length === 1 ? '' : 's'}{' '}
                {docsTaskId === task.id ? '▲' : '▼'}
              </button>
              {docsTaskId === task.id && (
                <TaskDocuments task={task} canManage={canManageDocs} onChange={loadData} />
              )}
            </li>
          )
        })}
        {tasks.length === 0 && (
          <p className="text-sm text-gray-500">
            {isAdmin ? 'No tasks yet. Create the first one.' : 'No tasks assigned to you yet.'}
          </p>
        )}
      </ul>
    </div>
  )
}
