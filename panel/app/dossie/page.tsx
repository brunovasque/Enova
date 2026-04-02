import { Suspense } from "react";
import DossieUI from "./DossieUI";

export default function DossiePage() {
  return (
    <Suspense>
      <DossieUI />
    </Suspense>
  );
}
