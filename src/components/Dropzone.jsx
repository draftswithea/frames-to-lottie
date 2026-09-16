import { useRef, useState } from "react";
import "./Dropzone.css";

export default function Dropzone({ onFiles }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    onFiles(e.dataTransfer.files);
  }

  return (
    <div
      className={"dropzone" + (dragging ? " drag" : "")}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 3v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="dropzone-primary">Drop .zip files here, or click to browse</div>
      <div className="dropzone-secondary">each zip should hold a numbered sequence of *.svg or *.png frames</div>
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        multiple
        style={{ display: "none" }}
        onChange={(e) => onFiles(e.target.files)}
      />
    </div>
  );
}
