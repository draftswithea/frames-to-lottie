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

  return (
    <div className="wrap">
      <header>
        <img src="/logo.svg" />
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
          />
        ))
      )}

      <div className="footnote">
        SVG parsing covers <code>&lt;path&gt;</code> elements using{" "}
        <code>M/L/C/Z</code> commands, reading <code>fill</code>,{" "}
        <code>stroke</code>, <code>stroke-width</code> and{" "}
        <code>fill-rule</code>. Gradients, filters, clip-paths, embedded images,
        text, and group transforms aren't converted. PNG frames are embedded as
        image layers (raster), so they won't rescale as crisply as vector frames
        at very large sizes.
      </div>
    </div>
  );
}
