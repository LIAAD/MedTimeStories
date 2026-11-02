import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useFilters, useLoaded } from "../data/DataContext";
import type { Report } from "../data/schema";
import { typeStyle } from "../lib/colors";
import { formatDate, graphEventKind, reportUrl, withEnglishSurfaces } from "../lib/util";
import { Card, EmptyState, Tabs, Toggle } from "../components/ui";
import TextWithSpans, { type Arrow } from "../components/TextWithSpans";
import EventPanel from "../components/EventPanel";
import TemporalGraph from "../components/TemporalGraph";

export default function ReportView() {
  const { patientId, reportId } = useParams();
  const { idx } = useLoaded();
  const report = idx.reports.get(reportId ?? "");
  if (!report || report.patientId !== patientId) {
    return <EmptyState title="Report not found" hint={`No report "${reportId}" for patient "${patientId}".`} />;
  }
  return <ReportInner key={report.id} report={report} />;
}

function ReportInner({ report }: { report: Report }) {
  const { idx } = useLoaded();
  const identityRelations = idx.patients.get(report.patientId)?.identityRelations ?? [];
  const localIdentityLinkCount = identityRelations.reduce((total, chain) => {
    const mentions = new Set(chain.chain.filter((id) => idx.events.get(id)?.reportId === report.id));
    return total + Math.max(0, mentions.size - 1);
  }, 0);
  const { active, matchEvent, filters } = useFilters();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [showArrows, setShowArrows] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showEnglish, setShowEnglish] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);

  const tab = sp.get("tab") === "graph" ? "graph" : "text";
  const eventId = sp.get("event");
  const selected = eventId ? idx.events.get(eventId) : undefined;
  const selectedHere = selected?.reportId === report.id ? selected : undefined;

  const visibleEvents = useMemo(() => report.events.filter((e) => !hiddenTypes.has(graphEventKind(e).type)), [report, hiddenTypes]);
  const english = showEnglish && !!report.textEn;
  const graphEvents = useMemo(() => (english ? withEnglishSurfaces(visibleEvents) : visibleEvents), [english, visibleEvents]);
  const navigable = useMemo(() => [...visibleEvents].sort((a, b) => a.start - b.start || b.end - a.end), [visibleEvents]);
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    report.events.forEach((e) => {
      const t = graphEventKind(e).type;
      m.set(t, (m.get(t) ?? 0) + 1);
    });
    return [...m.entries()].sort();
  }, [report]);

  const select = useCallback(
    (id: string | null) => {
      const ev = id ? idx.events.get(id) : undefined;
      if (ev && ev.reportId !== report.id) {
        navigate(reportUrl(report.patientId, ev.reportId, ev.id)); // push: gives back/forward across reports
        return;
      }
      setSp(
        (cur) => {
          const n = new URLSearchParams(cur);
          if (id) n.set("event", id);
          else n.delete("event");
          return n;
        },
        { replace: true },
      );
    },
    [idx, navigate, report, setSp],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/INPUT|SELECT|TEXTAREA/.test(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") return select(null);
      const fwd = e.key === "ArrowRight" || e.key === "ArrowDown";
      const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
      if ((!fwd && !back) || navigable.length === 0) return;
      e.preventDefault();
      const i = navigable.findIndex((x) => x.id === eventId);
      const next = fwd ? navigable[(i + 1) % navigable.length] : navigable[i <= 0 ? navigable.length - 1 : i - 1];
      select(next.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigable, eventId, select]);

  const focusId = hovered ?? selectedHere?.id ?? null;
  const relatedIds = useMemo(() => {
    const s = new Set<string>();
    if (!focusId) return s;
    idx.relationsByEvent.get(focusId)?.forEach((r) => s.add(r.other));
    idx.chainByEvent.get(focusId)?.chain.forEach((id) => id !== focusId && s.add(id));
    return s;
  }, [focusId, idx]);

  const arrows = useMemo<Arrow[]>(() => {
    if (!showArrows) return [];
    const vis = new Set(visibleEvents.map((e) => e.id));
    const temporal = report.temporalRelations
      .filter((r) => vis.has(r.source) && vis.has(r.target))
      .filter((r) => !filters.rel || r.type === filters.rel)
      .map((r) => ({ source: r.source, target: r.target, type: r.type }));
    const identity: Arrow[] = filters.rel
      ? []
      : identityRelations.flatMap((chain) => {
          const mentions = [...new Set(chain.chain.filter((id) => vis.has(id) && idx.events.get(id)?.reportId === report.id))];
          return mentions.slice(1).map((id, i): Arrow => ({ source: mentions[i], target: id, type: "IDENTITY", identity: true }));
        });
    return [...temporal, ...identity].filter((r) => !selectedHere || r.source === selectedHere.id || r.target === selectedHere.id);
  }, [showArrows, visibleEvents, report, filters.rel, selectedHere, identityRelations, idx]);

  const toggleType = (t: string) =>
    setHiddenTypes((cur) => {
      const n = new Set(cur);
      n.has(t) ? n.delete(t) : n.add(t);
      return n;
    });
  const setTab = (t: "text" | "graph") =>
    setSp((cur) => {
      const n = new URLSearchParams(cur);
      t === "graph" ? n.set("tab", "graph") : n.delete("tab");
      return n;
    }, { replace: true });

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Link to={`/patient/${encodeURIComponent(report.patientId)}`} className="hover:underline">{report.patientId}</Link>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{report.type}</span>
          <span>{formatDate(report.date)}</span>
          <span>{report.events.length} events · {report.temporalRelations.length} temporal TLinks · {localIdentityLinkCount} identity TLinks</span>
        </div>
        <h1 className="text-2xl font-semibold">{report.title}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Event types:</span>
        {typeCounts.map(([t, c]) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            aria-pressed={!hiddenTypes.has(t)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              hiddenTypes.has(t) ? "border-slate-300 text-slate-400 line-through dark:border-slate-700" : typeStyle(t).chip
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${typeStyle(t).dot}`} /> {t} ({c})
          </button>
        ))}
        <span className="ml-auto flex items-center gap-4">
          {tab === "text" && <Toggle checked={showArrows} onChange={setShowArrows} label="Temporal arrows" />}
          {tab === "text" && showArrows && <Toggle checked={showLabels} onChange={setShowLabels} label="Relation labels" />}
          {report.textEn && <Toggle checked={showEnglish} onChange={setShowEnglish} label="English (machine translated)" />}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          <Tabs value={tab} onChange={setTab} tabs={[{ id: "text", label: "Text" }, { id: "graph", label: "Temporal graph" }]} />
          {tab === "text" ? (
            report.text.trim() === "" ? (
              <EmptyState title="This report has no text" />
            ) : (
              <>
                <Card className="p-5">
                  <div lang="pt">
                  <TextWithSpans
                    text={report.text}
                    events={visibleEvents}
                    selectedId={selectedHere?.id}
                    relatedIds={relatedIds}
                    isDimmed={(e) => active && !matchEvent(e)}
                    onSelect={select}
                    onHover={setHovered}
                    arrows={arrows}
                    showArrowLabels={showLabels}
                    highlightArrows={!!selectedHere}
                  />
                  </div>
                </Card>
                {english && (
                  <Card className="p-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      English translation <span className="font-normal normal-case">(machine translated, may contain errors)</span>
                    </p>
                    <div lang="en" translate="no" className="whitespace-pre-wrap text-[15px] leading-relaxed">{report.textEn}</div>
                  </Card>
                )}
              </>
            )
          ) : (
            <TemporalGraph
              events={graphEvents}
              relations={report.temporalRelations}
              identityRelations={identityRelations}
              selectedId={selectedHere?.id}
              onSelect={select}
              onHover={setHovered}
            />
          )}
          <p className="text-xs text-slate-500">Tip: use the arrow keys to step through events, Esc to clear selection.</p>
        </div>
        <Card className="p-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-auto">
          <EventPanel event={selectedHere} onNavigate={select} onHover={setHovered} />
        </Card>
      </div>
    </div>
  );
}
