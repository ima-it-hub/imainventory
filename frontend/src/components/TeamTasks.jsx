import { useEffect, useState } from 'react'
import { MessageSquare, Plus, Send, X } from 'lucide-react'
import { useToast } from './ToastProvider'

const TASK_COLUMNS = [
  { status: 'todo', label: 'À faire', border: 'border-slate-300', card: 'border-slate-200 bg-white' },
  { status: 'in_progress', label: 'En cours', border: 'border-amber-400', card: 'border-amber-200 bg-amber-50' },
  { status: 'done', label: 'Terminé', border: 'border-emerald-400', card: 'border-emerald-200 bg-emerald-50' },
]

export default function TeamTasks({ apiUrl, currentUser, users }) {
  const toast = useToast()
  const [tasks, setTasks] = useState([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeUserId, setAssigneeUserId] = useState(String(currentUser?.id || ''))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draggedTaskId, setDraggedTaskId] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [comments, setComments] = useState([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentError, setCommentError] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const viewerId = Number(currentUser?.id)
  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    if (!error) return undefined
    toast.error(error)
    const timer = setTimeout(() => setError(''), 0)
    return () => clearTimeout(timer)
  }, [error, toast])

  useEffect(() => {
    if (!commentError) return undefined
    toast.error(commentError)
    const timer = setTimeout(() => setCommentError(''), 0)
    return () => clearTimeout(timer)
  }, [commentError, toast])

  async function loadTasks({ silent = false } = {}) {
    if (!Number.isInteger(viewerId) || viewerId <= 0) return
    if (!silent) setLoading(true)
    try {
      const response = await fetch(`${apiUrl}/api/team-tasks`, {
        headers: { Authorization: `Bearer ${currentUser?.sessionToken || ''}` },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load team tasks')
      setTasks(data.tasks || [])
      if (!silent) setError('')
    } catch (loadError) {
      if (!silent) setError(loadError.message || 'Unable to load team tasks')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks()
    let refreshInProgress = false

    async function refreshTasks() {
      if (document.hidden || refreshInProgress) return
      refreshInProgress = true
      try {
        await loadTasks({ silent: true })
      } finally {
        refreshInProgress = false
      }
    }

    function handleVisibilityChange() {
      if (!document.hidden) refreshTasks()
    }

    const intervalId = window.setInterval(refreshTasks, 10000)
    window.addEventListener('focus', refreshTasks)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshTasks)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [viewerId])

  useEffect(() => {
    if (!selectedTask) return undefined

    let active = true
    async function loadComments() {
      try {
        const response = await fetch(`${apiUrl}/api/team-tasks/${selectedTask.id}/comments`, {
          headers: { Authorization: `Bearer ${currentUser?.sessionToken || ''}` },
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load task comments')
        if (active) {
          setComments(data.comments || [])
          setCommentError('')
        }
      } catch (loadError) {
        if (active) setCommentError(loadError.message || 'Unable to load task comments')
      } finally {
        if (active) setCommentsLoading(false)
      }
    }

    setComments([])
    setCommentsLoading(true)
    setCommentDraft('')
    loadComments()
    const intervalId = window.setInterval(loadComments, 10000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [selectedTask?.id, currentUser?.sessionToken])

  async function createTask(event) {
    event.preventDefault()
    if (!title.trim() || !assigneeUserId || saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/team-tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentUser?.sessionToken || ''}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          assigneeUserId: Number(assigneeUserId),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to create task')
      setTasks((current) => [data.task, ...current])
      setTitle('')
      setDescription('')
      if (isAdmin || Number(assigneeUserId) === viewerId) setAssigneeUserId(String(currentUser.id))
    } catch (createError) {
      setError(createError.message || 'Unable to create task')
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(task, nextStatus) {
    if (!TASK_COLUMNS.some((column) => column.status === nextStatus) || task.status === nextStatus) return
    if (!isAdmin && Number(task.assigneeUserId) !== viewerId) return
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/team-tasks/${task.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentUser?.sessionToken || ''}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to update task status')
      setTasks((current) => current.map((entry) => entry.id === task.id ? { ...entry, ...data.task } : entry))
    } catch (statusError) {
      setError(statusError.message || 'Unable to update task status')
    } finally {
      setDraggedTaskId(null)
    }
  }

  async function addComment(event) {
    event.preventDefault()
    if (!selectedTask || !commentDraft.trim() || commentSaving) return
    setCommentSaving(true)
    setCommentError('')
    try {
      const response = await fetch(`${apiUrl}/api/team-tasks/${selectedTask.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentUser?.sessionToken || ''}`,
        },
        body: JSON.stringify({ comment: commentDraft.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to add comment')
      setComments((current) => [...current, data.comment])
      setCommentDraft('')
    } catch (saveError) {
      setCommentError(saveError.message || 'Unable to add comment')
    } finally {
      setCommentSaving(false)
    }
  }

  function openTask(task) {
    setSelectedTask(task)
    setTasks((current) => current.map((entry) => (
      entry.id === task.id ? { ...entry, hasUnreadComments: false } : entry
    )))
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 border border-slate-200 bg-white p-4">
      <header className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Équipe</p>
        <h2 className="text-xl font-black text-slate-900">To-do list</h2>
      </header>

      <form onSubmit={createTask} className="grid gap-3 border border-slate-200 bg-slate-50 p-3 md:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(200px,1.2fr)_auto] md:items-end">
        <label className="text-xs font-semibold text-slate-600">
          Tâche
          <input
            required
            maxLength={255}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Titre de la tâche"
            className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-sky-600"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Assigner à
          <select
            value={assigneeUserId}
            onChange={(event) => setAssigneeUserId(event.target.value)}
            required
            className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-sky-600"
          >
            <option value="" disabled>Choisir un utilisateur</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.fullName || user.username}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Détails
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Détails facultatifs"
            className="mt-1 block w-full border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-sky-600"
          />
        </label>
        <button
          type="submit"
          disabled={saving || !title.trim() || !assigneeUserId}
          className="inline-flex items-center justify-center gap-2 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {saving ? 'Enregistrement…' : 'Ajouter'}
        </button>
      </form>

      {loading ? <p className="py-8 text-center text-sm text-slate-500">Chargement des tâches…</p> : null}
      {!loading && !tasks.length ? <p className="py-8 text-center text-sm text-slate-500">Aucune tâche visible pour le moment.</p> : null}

      <div className="grid min-h-[340px] flex-1 gap-3 overflow-x-auto pb-2 md:grid-cols-3">
        {TASK_COLUMNS.map((column) => {
          const columnTasks = tasks.filter((task) => task.status === column.status)
          return (
            <section
              key={column.status}
              aria-label={`Tâches ${column.label}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const taskId = Number(event.dataTransfer.getData('text/plain') || draggedTaskId)
                const task = tasks.find((entry) => entry.id === taskId)
                if (task) changeStatus(task, column.status)
              }}
              className={`flex min-w-[250px] flex-col border-t-4 ${column.border} bg-slate-50/70 p-3`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">{column.label}</h3>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-700">{columnTasks.length}</span>
              </div>
              <div className="flex min-h-[180px] flex-1 flex-col gap-2">
                {columnTasks.map((task) => (
                  (() => {
                    const canUpdateStatus = isAdmin || Number(task.assigneeUserId) === viewerId
                    return (
                  <article
                    key={task.id}
                    draggable={canUpdateStatus}
                    onClick={() => openTask(task)}
                    tabIndex={0}
                    onDragStart={(event) => {
                      if (!canUpdateStatus) {
                        event.preventDefault()
                        return
                      }
                      setDraggedTaskId(task.id)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', String(task.id))
                    }}
                    onDragEnd={() => setDraggedTaskId(null)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        openTask(task)
                        return
                      }
                      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                      if (!canUpdateStatus) return
                      const index = TASK_COLUMNS.findIndex((entry) => entry.status === task.status)
                      const nextColumn = TASK_COLUMNS[index + (event.key === 'ArrowRight' ? 1 : -1)]
                      if (nextColumn) changeStatus(task, nextColumn.status)
                    }}
                    aria-label={`${task.title}. Assigné à ${task.assigneeName}. Créé par ${task.createdByName}. Flèches gauche et droite pour changer le statut.`}
                    className={`${canUpdateStatus ? 'cursor-grab' : 'cursor-pointer'} border p-3 shadow-sm transition hover:shadow ${column.card} ${draggedTaskId === task.id ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{task.title}</h4>
                      {task.hasUnreadComments ? (
                        <span role="img" aria-label="New comment" title="New comment" className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                      ) : null}
                    </div>
                    {task.description ? <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{task.description}</p> : null}
                    <p className="mt-3 border-t border-black/10 pt-2 text-xs text-slate-600">
                      Assigné à {task.assigneeName || 'Utilisateur'} · par {task.createdByName || 'Utilisateur'}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs text-sky-700"><MessageSquare className="h-3.5 w-3.5" /> Ouvrir les commentaires</span>
                  </article>
                    )
                  })()
                ))}
                {!columnTasks.length ? <p className="border border-dashed border-slate-300 bg-white/70 px-3 py-6 text-center text-xs text-slate-500">Déposez une tâche ici</p> : null}
              </div>
            </section>
          )
        })}
      </div>

      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={() => setSelectedTask(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-task-dialog-title"
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 id="team-task-dialog-title" className="text-lg font-bold text-slate-900">{selectedTask.title}</h3>
                <p className="mt-1 text-sm text-slate-600">Assigné à {selectedTask.assigneeName} · créé par {selectedTask.createdByName}</p>
              </div>
              <button type="button" onClick={() => setSelectedTask(null)} aria-label="Fermer les commentaires" className="inline-flex h-9 w-9 items-center justify-center border border-slate-200 text-slate-600 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </header>
            {selectedTask.description ? <p className="border-b border-slate-200 px-5 py-3 text-sm text-slate-700">{selectedTask.description}</p> : null}
            <div className="min-h-[180px] flex-1 space-y-3 overflow-y-auto p-5">
              {commentsLoading && !comments.length ? <p className="text-sm text-slate-500">Chargement des commentaires…</p> : null}
              {!commentsLoading && !comments.length && !commentError ? <p className="text-sm text-slate-500">Aucun commentaire pour le moment.</p> : null}
              {comments.map((comment) => (
                <article key={comment.id} className="border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800">{comment.authorName}</p>
                    <time className="text-xs text-slate-500">{new Date(comment.createdAt).toLocaleString()}</time>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{comment.comment}</p>
                </article>
              ))}
            </div>
            {(isAdmin
              || Number(selectedTask.assigneeUserId) === viewerId
              || Number(selectedTask.createdByUserId) === viewerId) ? (
              <form onSubmit={addComment} className="flex items-end gap-2 border-t border-slate-200 p-4">
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  maxLength={5000}
                  rows={2}
                  placeholder="Écrire un commentaire"
                  className="min-h-11 flex-1 resize-y border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-600"
                />
                <button type="submit" disabled={!commentDraft.trim() || commentSaving} aria-label="Envoyer le commentaire" className="inline-flex h-11 w-11 items-center justify-center bg-slate-900 text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                  <Send className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <p className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">Seuls l’assigné, le créateur ou l’administrateur peuvent commenter cette tâche.</p>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
