import { Suspense } from "react";
import { SimulatorApp } from "@/components/simulator/SimulatorApp";

export default function SimulatorPage() {
  return (
    <Suspense>
      <SimulatorApp />
    </Suspense>
  );
}
