import { LayoutSection } from "./LayoutSection";
import { ModulesSection } from "./ModulesSection";

export function LeftPanel() {
  return (
    <aside className="panel panel-left" aria-label="Настройки">
      <h1 className="brand">LOOPVIZ</h1>
      <ModulesSection />
      <LayoutSection />
    </aside>
  );
}
