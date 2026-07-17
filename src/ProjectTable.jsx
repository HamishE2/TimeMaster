import { useState } from 'react';
import { weekDates, dayLabel } from './utils';
import ProjectRow from './ProjectRow';
import TotalsRow from './TotalsRow';

export default function ProjectTable({ projects, weekKey, visibleDays, setEntry, onEdit, onDelete, moveProject, leaveDays = [], leaveWeeks = {}, toggleLeaveDay }) {
  const entries = weekDates(weekKey, visibleDays);
  const todayStr = new Date().toDateString();
  const todayIndex = entries.find(e => e.date.toDateString() === todayStr)?.dayIndex ?? -1;

  // Drag-and-drop state
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [dragOverPosition, setDragOverPosition] = useState(null); // 'top' | 'middle' | 'bottom'

  // Day subtotals for column highlighting
  const dayTotals = visibleDays.map(dayIdx =>
    projects.reduce((sum, p) => {
      const v = p.entries?.[weekKey]?.[dayIdx];
      return sum + (v != null ? Number(v) : 0);
    }, 0)
  );

  const getColClass = (total, isLeave) => {
    const target = isLeave ? 0 : 7.6;
    if (isLeave && total > 0) return ' col-over';
    if (total === target) return ' col-perfect';
    if (total > target) return ' col-over';
    return '';
  };

  const handleDragStart = (e, id) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    if (id === draggedId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const ratio = relativeY / rect.height;

    let position = 'middle';
    if (ratio < 0.25) {
      position = 'top';
    } else if (ratio > 0.75) {
      position = 'bottom';
    }

    if (dragOverId !== id || dragOverPosition !== position) {
      setDragOverId(id);
      setDragOverPosition(position);
    }
  };

  const handleDragLeave = (e, id) => {
    if (dragOverId === id) {
      setDragOverId(null);
      setDragOverPosition(null);
    }
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedId;
    if (sourceId && sourceId !== targetId) {
      moveProject(sourceId, targetId, dragOverPosition);
    }
    setDraggedId(null);
    setDragOverId(null);
    setDragOverPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
    setDragOverPosition(null);
  };

  return (
    <div className="table-wrap">
      <table className="tracker-table">
        <thead>
          <tr>
            <th className="th-project">Project</th>
            {entries.map((e, i) => {
              const isLeave = leaveDays.includes(e.dayIndex);
              return (
                <th key={e.dayIndex} className={`th-day${e.dayIndex === todayIndex ? ' th-today' : ''}${getColClass(dayTotals[i], isLeave)}${isLeave ? ' th-leave-day' : ''}`} style={{ position: 'relative' }}>
                  <div className="day-label-wrap">
                    <span>{dayLabel(e.date)}</span>
                    <button 
                      className={`leave-toggle-btn${isLeave ? ' is-leave' : ''}`}
                      onClick={() => toggleLeaveDay?.(weekKey, e.dayIndex)}
                      title={isLeave ? "Mark day as working" : "Mark day as leave"}
                      aria-label={isLeave ? "Mark day as working" : "Mark day as leave"}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                      </svg>
                    </button>
                  </div>
                </th>
              );
            })}
            <th className="th-resourced">Resourced</th>
            <th className="th-used">Used</th>
            <th className="th-remaining">Remaining</th>
            <th className="th-actions"></th>
          </tr>
        </thead>
        <tbody>
          {projects.map(p => (
            <ProjectRow
              key={p.id}
              project={p}
              weekKey={weekKey}
              visibleDays={visibleDays}
              todayIndex={todayIndex}
              dayTotals={dayTotals}
              setEntry={setEntry}
              onEdit={onEdit}
              onDelete={onDelete}
              leaveDays={leaveDays}
              leaveWeeks={leaveWeeks}
              draggedId={draggedId}
              dragOverId={dragOverId}
              dragOverPosition={dragOverId === p.id ? dragOverPosition : null}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))}
        </tbody>
        {projects.length > 0 && (
          <tfoot>
            <TotalsRow projects={projects} weekKey={weekKey} visibleDays={visibleDays} todayIndex={todayIndex} dayTotals={dayTotals} leaveDays={leaveDays} leaveWeeks={leaveWeeks} />
          </tfoot>
        )}
      </table>
    </div>
  );
}
