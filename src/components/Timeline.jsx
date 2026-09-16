import { useRef, useState } from "react";
import "./Timeline.css";

export default function Timeline({ frames, onChange }) {
  const dragIndex = useRef(null);
  const [overIndex, setOverIndex] = useState(null);

  function handleDragStart(e, index) {
    dragIndex.current = index;
    // Firefox (and some Safari versions) require dataTransfer.setData to be
    // called in the dragstart handler or the drag operation never initiates.
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIndex(index);
  }

  function handleDrop(e, index) {
    e.preventDefault();
    const from = dragIndex.current;
    dragIndex.current = null;
    setOverIndex(null);
    if (from === null || from === index) return;
    const next = frames.slice();
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    onChange(next);
  }

  function handleDragEnd() {
    dragIndex.current = null;
    setOverIndex(null);
  }

  function handleRemove(index) {
    const next = frames.slice();
    next.splice(index, 1);
    onChange(next);
  }

  return (
    <div className="timeline">
      <div className="timeline-track">
        {frames.map((frame, index) => (
          <div
            key={frame.id}
            className={"timeline-item" + (overIndex === index ? " drag-over" : "")}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            title={frame.name}
          >
            <button
              className="timeline-remove"
              onClick={() => handleRemove(index)}
              aria-label={`Remove frame ${index + 1}`}
            >
              ×
            </button>
            <div className="timeline-thumb">
              <img src={frame.thumbUrl} alt={frame.name} draggable={false} />
            </div>
            <div className="timeline-meta">
              <span className="timeline-index">{index + 1}</span>
              <span className="timeline-type">{frame.type}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
