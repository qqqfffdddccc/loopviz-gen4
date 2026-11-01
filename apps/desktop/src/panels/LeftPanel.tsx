import { LayoutSection } from "./LayoutSection";
import { ModulesSection } from "./ModulesSection";
import { SourceSection } from "./SourceSection";

export function LeftPanel() {
  return (
    <aside className="panel panel-left" aria-label="Настройки">
      <h1 className="brand">LOOPVIZ</h1>
      <SourceSection />
      <ModulesSection />
      <LayoutSection />
    </aside>
  );
}
