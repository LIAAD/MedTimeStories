import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAddPatient, useLoaded } from "../data/DataContext";
import { casToPatient } from "../lib/casConvert";
import { reportUrl } from "../lib/util";
import { Card, Spinner } from "../components/ui";

export default function Annotate() {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addPatient = useAddPatient();
  const { idx } = useLoaded();
  const navigate = useNavigate();

  const loadExample = async () => {
    setError(null);
    try {
      const res = await fetch("/data/example-report.txt");
      if (!res.ok) throw new Error(`Could not load the example (HTTP ${res.status}).`);
      setText(await res.text());
      if (!name.trim()) setName("Example");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const base = name.trim().replace(/\s+/g, " ");
      let patientId = base;
      for (let n = 2; idx.patients.has(patientId); n++) patientId = `${base} (${n})`;
      const res = await fetch("/api/annotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, name: patientId }),
      });
      const started = await res.json().catch(() => null);
      if (!res.ok) throw new Error(started?.error ?? `Annotation failed (HTTP ${res.status}).`);

      // the pipeline runs in the background on the server; poll until it is done
      let body: { status: string; error?: string; result?: unknown } | null = null;
      while (!body || body.status === "running") {
        await new Promise((r) => setTimeout(r, 3000));
        const poll = await fetch(`/api/annotate/${started.id}`);
        body = await poll.json().catch(() => null);
        if (!poll.ok || !body) throw new Error(`Annotation failed (HTTP ${poll.status}).`);
      }
      if (body.status === "error") throw new Error(body.error ?? "Annotation failed.");
      const patient = casToPatient(body.result as Record<string, unknown>, patientId);
      if (!patient.reports.length) throw new Error("No report found in the text.");
      addPatient(patient);
      navigate(reportUrl(patient.id, patient.reports[0].id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Annotate a report</h1>
      <p className="text-sm text-slate-500">
        Paste a Portuguese clinical report. The LLM pipeline annotates events, temporal expressions and temporal links, then the
        result opens in the report view. Several reports can be pasted one after the other, separated by a blank line. This takes a few minutes.
      </p>
      <Card className="p-3">
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium">Patient_Id</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            placeholder="e.g. My test patient"
            className="w-full max-w-sm rounded-md border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          rows={18}
          placeholder="Paste the report text here…"
          className="w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={loadExample}
            disabled={busy}
            className="rounded-md border border-slate-300 px-4 py-1.5 text-sm enabled:hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:enabled:hover:bg-slate-800"
          >
            Load example
          </button>
          <button
            onClick={run}
            disabled={busy || !text.trim() || !name.trim()}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white enabled:hover:bg-indigo-700 disabled:opacity-50"
          >
            Annotate
          </button>
          {busy && (
            <span className="flex items-center gap-2 text-sm text-slate-500">
              <Spinner /> Annotating, please wait…
            </span>
          )}
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      </Card>
    </div>
  );
}
