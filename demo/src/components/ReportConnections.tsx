import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Patient } from "../data/schema";
import { compareReports } from "../data/loader";
import { useLoaded } from "../data/DataContext";
import { formatDate, reportLabel, reportUrl } from "../lib/util";
import GraphCanvas, { type GEdgeData, type GNodeData } from "./GraphCanvas";

export default function ReportConnections({ patient }: { patient: Patient }) {
  const { idx } = useLoaded();
  const navigate = useNavigate();
  const reports = useMemo(() => [...patient.reports].sort(compareReports), [patient]);

  const model = useMemo(() => {
    const reportOrder = new Map(reports.map((report, index) => [report.id, index]));
    const connections = new Map<string, { source: string; target: string; count: number }>();
    const addConnection = (a: string, b: string) => {
      const [source, target] = (reportOrder.get(a) ?? 0) <= (reportOrder.get(b) ?? 0) ? [a, b] : [b, a];
      const key = `${source}|${target}`;
      const connection = connections.get(key);
      if (connection) connection.count++;
      else connections.set(key, { source, target, count: 1 });
    };

    for (const report of reports) {
      for (const relation of report.temporalRelations) {
        const source = idx.events.get(relation.source);
        const target = idx.events.get(relation.target);
        if (!source || !target || source.reportId === target.reportId) continue;
        addConnection(source.reportId, target.reportId);
      }
    }

    for (const chain of patient.identityRelations) {
      const linkedReports = [...new Set(chain.chain.map((eventId) => idx.events.get(eventId)?.reportId).filter((id): id is string => !!id))].sort(
        (a, b) => (reportOrder.get(a) ?? 0) - (reportOrder.get(b) ?? 0),
      );
      for (let index = 0; index < linkedReports.length - 1; index++) addConnection(linkedReports[index], linkedReports[index + 1]);
    }

    const nodes: GNodeData[] = reports.map((report, index) => ({
      id: report.id,
      label: report.title,
      type: "REPORT",
      lane: `${String(index + 1).padStart(2, "0")} ${reportLabel(idx, report.id)}`,
      sublabel: `${formatDate(report.date)} · ${report.events.length} events`,
      hint: index,
    }));
    const edges: GEdgeData[] = [...connections.values()].map((connection) => ({
      id: `${connection.source}|${connection.target}`,
      source: connection.source,
      target: connection.target,
      type: `${connection.count} relations`,
      layoutType: "BEFORE",
      directed: false,
    }));
    return { nodes, edges };
  }, [idx, patient, reports]);

  return (
    <div className="space-y-3">
      <GraphCanvas
        nodes={model.nodes}
        edges={model.edges}
        selectedIds={new Set()}
        onSelect={(reportId) => navigate(reportUrl(patient.id, reportId))}
      />
    </div>
  );
}