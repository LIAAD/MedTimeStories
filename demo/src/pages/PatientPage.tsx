import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useLoaded } from "../data/DataContext";
import { compareReports } from "../data/loader";
import { chainEvents, formatDate, reportLabel, reportUrl, truncate } from "../lib/util";
import { Card, EmptyState, Tabs } from "../components/ui";
import StatsPanel from "../components/StatsPanel";
import CorefView from "../components/CorefView";
import PatientTimeline from "../components/PatientTimeline";
import ReportConnections from "../components/ReportConnections";

type Tab = "reports" | "connections" | "coref" | "timeline";

export default function PatientPage() {
  const { patientId } = useParams();
  const { idx } = useLoaded();
  const [sp, setSp] = useSearchParams();
  const patient = idx.patients.get(patientId ?? "");
  const tab = (["reports", "connections", "coref", "timeline"].includes(sp.get("tab") ?? "") ? sp.get("tab") : "reports") as Tab;

  const reports = useMemo(() => (patient ? [...patient.reports].sort(compareReports) : []), [patient]);
  const events = useMemo(() => reports.flatMap((r) => r.events), [reports]);
  const relations = useMemo(() => reports.flatMap((r) => r.temporalRelations), [reports]);

  if (!patient) return <EmptyState title={`Patient "${patientId}" not found`} hint="Use the Patients link in the breadcrumb." />;
  const stats = idx.patientStats.get(patient.id)!;
  const cross = (idx.chainsByPatient.get(patient.id) ?? []).filter((c) => c.crossReport);

  const stat = (label: string, v: number) => (
    <Card className="p-3">
      <div className="text-2xl font-semibold tabular-nums">{v}</div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Patient {patient.id}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("Reports", stats.reportCount)}
        {stat("Events", stats.eventCount)}
        {stat("Temporal relations", stats.relationCount)}
        {stat("Cross-report chains", stats.crossChainCount)}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Tabs
            value={tab}
            onChange={(t) => setSp({ tab: t }, { replace: true })}
            tabs={[
              { id: "reports", label: "Reports" },
              { id: "connections", label: "Report links" },
              { id: "coref", label: "Cross-report relations" },
              { id: "timeline", label: "Patient timeline" },
            ]}
          />
          {tab === "reports" && (
            <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5 dark:border-slate-800">
              {reports.map((r) => (
                <li key={r.id} className="relative">
                  <span className="absolute -left-[1.65rem] top-4 h-3 w-3 rounded-full bg-indigo-500 ring-4 ring-slate-50 dark:ring-slate-950" />
                  <Link to={reportUrl(patient.id, r.id)} className="block">
                    <Card className="p-4 transition hover:border-indigo-400">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold">{formatDate(r.date)}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{r.type}</span>
                        <span>{reportLabel(idx, r.id)}</span>
                        <span className="ml-auto">{r.events.length} events</span>
                      </div>
                      <h3 className="mt-1 font-semibold">{r.title}</h3>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{truncate(r.text, 160)}</p>
                    </Card>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {tab === "coref" && <CorefView patient={patient} />}
          {tab === "connections" && <ReportConnections patient={patient} />}
          {tab === "timeline" && <PatientTimeline patient={patient} />}
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Cross-report links</h4>
            {cross.length === 0 ? (
              <p className="text-sm text-slate-500">No chains span multiple reports.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {cross.slice(0, 5).map((c) => {
                  const m = chainEvents(idx, c);
                  return (
                    <li key={c.id}>
                      <Link to={`/patient/${encodeURIComponent(patient.id)}?tab=coref`} className="hover:underline">
                        {[...new Set(m.map((e) => e.surface.toLowerCase()))].slice(0, 3).join(" → ")}
                      </Link>
                      <span className="text-xs text-slate-500"> · {m.length} mentions, {c.reportIds.length} reports</span>
                    </li>
                  );
                })}
                {cross.length > 5 && (
                  <li>
                    <button onClick={() => setSp({ tab: "coref" })} className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
                      View all {cross.length} chains
                    </button>
                  </li>
                )}
              </ul>
            )}
          </Card>
          <StatsPanel events={events} relations={relations} />
        </aside>
      </div>
    </div>
  );
}
