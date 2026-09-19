import { useState } from "react";
import Dropzone from "./components/Dropzone";
import OptionsPanel from "./components/OptionsPanel";
import JobCard from "./components/JobCard";
import { ingestZip } from "./lib/zipIngest";
import "./App.css";

function niceName(zipName) {
  let n = zipName.replace(/\.zip$/i, "");
  n = n.replace(/-\d{8}T\d{6}Z.*$/i, ""); // strip common export timestamp suffix
  return n.trim() || "animation";
}

let jobSeq = 0;

export default function App() {
  const [options, setOptions] = useState({ size: 500, fr: 12, hold: 2 });
  const [jobs, setJobs] = useState([]);
  const [errors, setErrors] = useState([]);

  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter((f) => /\.zip$/i.test(f.name));
    for (const file of files) {
      const name = niceName(file.name);
      const jobId = "job_" + jobSeq++;
      try {
        const frames = await ingestZip(file);
        setJobs((prev) => [...prev, { id: jobId, name, frames }]);
      } catch (err) {
        setErrors((prev) => [...prev, `${file.name}: ${err.message || err}`]);
      }
    }
  }

  function updateJobFrames(jobId, nextFrames) {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, frames: nextFrames } : j)),
    );
  }

  function removeJob(jobId) {
    setJobs((prev) => {
      const job = prev.find((j) => j.id === jobId);
      if (job) {
        // Frames with a blob: thumbUrl (PNGs, including auto-rasterized SVG
        // frames) hold a live object URL -- release it now that the job
        // and its zip data are being dropped entirely.
        job.frames.forEach((f) => {
          if (f.thumbUrl && f.thumbUrl.startsWith("blob:"))
            URL.revokeObjectURL(f.thumbUrl);
        });
      }
      return prev.filter((j) => j.id !== jobId);
    });
  }

  return (
    <div className="wrap">
      <header>
        <img src="/logo.svg" alt="Logo" width={50} height={50} />
        <p className="kicker">
          svg + png sequence → lottie, entirely in-browser
        </p>
        <h1>SVG/PNG frame sequence → Lottie</h1>
        <p>
          Drop in one or more .zip files, each holding a numbered sequence of
          frame SVGs or PNGs. SVG frames convert to native vector shapes; PNG
          frames become embedded image layers. Reorder frames on the timeline
          before exporting.
        </p>
      </header>

      <div className="panel">
        <Dropzone onFiles={handleFiles} />
        <OptionsPanel options={options} onChange={setOptions} />
      </div>

      {errors.length > 0 && (
        <div className="errors">
          {errors.map((e, i) => (
            <div key={i} className="error-line">
              {e}
            </div>
          ))}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="empty">
          No sequences loaded yet — drop a zip above to get started.
        </div>
      ) : (
        jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            options={options}
            onFramesChange={(next) => updateJobFrames(job.id, next)}
            onRemove={() => removeJob(job.id)}
          />
        ))
      )}

      <div className="footnote">
        SVG parsing covers <code>&lt;path&gt;</code> (<code>M/L/C/Z</code>{" "}
        commands), <code>&lt;circle&gt;</code>, <code>&lt;ellipse&gt;</code>,{" "}
        <code>&lt;rect&gt;</code>, <code>&lt;line&gt;</code>,{" "}
        <code>&lt;polyline&gt;</code> and <code>&lt;polygon&gt;</code>. Fill and
        stroke are resolved like a real renderer: inline <code>style</code>,{" "}
        <code>&lt;style&gt;</code> class rules, presentation attributes, and
        inheritance from parent elements, in hex/rgb/hsl/named-color formats. A
        frame using gradients, filters, masks, clip-paths,{" "}
        <code>&lt;use&gt;</code>, text, or transforms is automatically
        rasterized to PNG instead of being converted (shown as <code>png*</code>{" "}
        on its thumbnail), since those aren't safe to convert to flat vector
        shapes.
      </div>
    </div>
  );
}
