import { useState } from 'react'
import TaskBank from './TaskBank.jsx'
import TaskEditor from './TaskEditor.jsx'

export default function TaskBankPage() {
  const [editing, setEditing] = useState(null) // id задачи, 'new' или null
  const [version, setVersion] = useState(0)
  return (
    <div className="pad">
      <TaskBank version={version} onOpen={setEditing} onNew={() => setEditing('new')} />
      {editing && (
        <TaskEditor
          key={editing}
          taskId={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(t, isNew) => {
            setVersion((v) => v + 1)
            if (isNew) setEditing(t.id)
          }}
        />
      )}
    </div>
  )
}
