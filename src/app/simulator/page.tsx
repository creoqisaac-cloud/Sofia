import { Suspense } from "react";
import { SimulatorApp } from "@/components/simulator/SimulatorApp";

export default function SimulatorPage() {
  return (
    <div className="legacy-tool">
      <Suspense>
        <SimulatorApp />
      </Suspense>
    </div>
  );
}
