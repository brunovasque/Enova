import { Suspense } from "react";
import { IncidentesUI } from "./IncidentesUI";

export default function IncidentesPage() {
  return (
    <Suspense>
      <IncidentesUI />
    </Suspense>
  );
}
