import { Route, Routes } from "react-router-dom";
import { DataGate } from "./data/DataContext";
import Layout from "./components/Layout";
import PatientList from "./pages/PatientList";
import PatientPage from "./pages/PatientPage";
import Patterns from "./pages/Patterns";
import WordGraph from "./pages/WordGraph";
import Annotate from "./pages/Annotate";
import ReportView from "./pages/ReportView";
import { EmptyState } from "./components/ui";

export default function App() {
  return (
    <DataGate>
      <Layout>
        <Routes>
          <Route path="/" element={<PatientList />} />
          <Route path="/annotate" element={<Annotate />} />
          <Route path="/words" element={<WordGraph />} />
          <Route path="/patterns" element={<Patterns />} />
          <Route path="/patient/:patientId" element={<PatientPage />} />
          <Route path="/patient/:patientId/report/:reportId" element={<ReportView />} />
          <Route path="*" element={<EmptyState title="Page not found" />} />
        </Routes>
      </Layout>
    </DataGate>
  );
}
