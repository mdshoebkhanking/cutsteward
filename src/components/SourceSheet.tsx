import { File, Link2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../lib/api";
import type { SourceReference } from "../types";
import { Sheet } from "./Sheet";

export function SourceSheet({ open, onClose, onAdded }: {
  open: boolean;
  onClose: () => void;
  onAdded: (sources: SourceReference[]) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const add = async () => {
    if (adding) return;
    setAdding(true);
    setError("");
    try {
      const added: SourceReference[] = [];
      for (const file of files) added.push(await api.addSourceFile(file));
      if (url.trim()) added.push(await api.addSourceUrl(url.trim()));
      if (added.length) onAdded(added);
      setFiles([]);
      setUrl("");
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not store the source locally.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add source"
      description="Files stay on this device until a named provider action asks for separate approval."
      footer={
        <>
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button small" type="button" disabled={adding || (!files.length && !url.trim())} onClick={add}>{adding ? "Storing…" : "Add locally"}</button>
        </>
      }
    >
      <button className="drop-source" type="button" onClick={() => picker.current?.click()}>
        <Upload size={22} />
        <span><strong>Choose files</strong><small>Video, image, audio, document, or a folder manifest</small></span>
      </button>
      <input ref={picker} hidden multiple type="file" onChange={(event) => setFiles(Array.from(event.target.files || []))} />
      {files.length > 0 && (
        <div className="picked-files">
          {files.map((file) => <span key={`${file.name}-${file.size}-${file.lastModified}`}><File size={15} />{file.name}</span>)}
        </div>
      )}
      <label className="url-field">
        <span><Link2 size={16} /> Website or reference URL</span>
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" inputMode="url" />
      </label>
      <p className="sheet-note">A URL is context, not permission to log in, upload, purchase, generate, or publish. The active runner must ask at those boundaries.</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </Sheet>
  );
}
