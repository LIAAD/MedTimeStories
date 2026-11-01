import { Link } from "react-router-dom";
import type { RelationRef } from "../data/loader";
import type { ClinEvent } from "../data/schema";
import { useLoaded } from "../data/DataContext";
import { chainEvents, formatDate, reportLabel, reportUrl } from "../lib/util";
import { EmptyState, EventChip } from "./ui";

interface Props {
  event?: ClinEvent;
  onNavigate: (eventId: string) => void;
  onHover: (id: string | null) => void;
}

export default function EventPanel({ event, onNavigate, onHover }: Props) {
  const { idx } = useLoaded();
  if (!event) {
    return <EmptyState title="No event selected" hint="Click a highlighted span, or use the arrow keys to step through events." />;
  }
  const report = idx.reports.get(event.reportId)!;
  const refs = idx.relationsByEvent.get(event.id) ?? [];
  const grouped = new Map<string, { out: RelationRef[]; in: RelationRef[] }>();
  for (const r of refs) {
    const g = grouped.get(r.relation.type) ?? { out: [], in: [] };
    g[r.direction].push(r);
    grouped.set(r.relation.type, g);
  }
  const chain = idx.chainByEvent.get(event.id);
  const members = chain ? chainEvents(idx, chain) : [];

  const EventButton = ({ id, arrow }: { id: string; arrow: string }) => {
    const e = idx.events.get(id)!;
    const other = e.reportId !== event.reportId;
    return (
      <li>
        <button
          onClick={() => onNavigate(id)}
          onMouseEnter={() => onHover(id)}
          onMouseLeave={() => onHover(null)}
          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <span className="text-slate-400">{arrow}</span>
          <span className="truncate font-medium">{e.surface}</span>
          <EventChip event={e} className="ml-auto shrink-0" />
          {other && <span className="shrink-0 rounded bg-indigo-100 px-1.5 text-xs text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">{reportLabel(idx, e.reportId)}</span>}
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-start justify-between gap-2">
          <h2 className="break-words text-xl font-semibold">{event.surface}</h2>
          <EventChip event={event} />
        </div>
        {event.surfaceEn && event.surfaceEn.toLowerCase() !== event.surface.toLowerCase() && (
          <p className="mt-1 text-sm italic text-slate-500" lang="en" translate="no">English: {event.surfaceEn}</p>
        )}
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">ID</dt>
          <dd className="break-all font-mono text-xs">{event.id}</dd>
          <dt className="text-slate-500">Offsets</dt>
          <dd className="font-mono text-xs">[{event.start}, {event.end})</dd>
          <dt className="text-slate-500">Report</dt>
          <dd>
            <Link className="text-indigo-600 hover:underline dark:text-indigo-400" to={reportUrl(report.patientId, report.id)}>
              {report.title}
            </Link>{" "}
            <span className="text-slate-500">({formatDate(report.date)})</span>
          </dd>
          {Object.entries(event.attributes ?? {}).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500">{k}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Temporal relations</h3>
        {grouped.size === 0 ? (
          <p className="text-sm text-slate-500">No temporal relations.</p>
        ) : (
          [...grouped.entries()].map(([type, g]) => (
            <div key={type} className="mb-3">
              <div className="mb-1 inline-block rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold dark:bg-slate-700">{type}</div>
              {g.out.length > 0 && (
                <>
                  <p className="mt-1 text-xs text-slate-500">This event {type} →</p>
                  <ul>{g.out.map((r) => <EventButton key={r.relation.id} id={r.other} arrow="→" />)}</ul>
                </>
              )}
              {g.in.length > 0 && (
                <>
                  <p className="mt-1 text-xs text-slate-500">← {type} this event</p>
                  <ul>{g.in.map((r) => <EventButton key={r.relation.id} id={r.other} arrow="←" />)}</ul>
                </>
              )}
            </div>
          ))
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Coreference chain</h3>
        {!chain ? (
          <p className="text-sm text-slate-500">Not part of a coreference chain.</p>
        ) : (
          <>
            <p className="mb-1 text-xs text-slate-500">
              {members.length} mentions across {chain.reportIds.length} report(s)
            </p>
            <ul>
              {members.map((m) =>
                m.id === event.id ? (
                  <li key={m.id} className="px-2 py-1 text-sm italic text-slate-500">• {m.surface} (this mention)</li>
                ) : (
                  <EventButton key={m.id} id={m.id} arrow="≡" />
                ),
              )}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
