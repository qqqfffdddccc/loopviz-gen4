import { ExportSection } from "./ExportSection";
import { LayoutSection } from "./LayoutSection";
import { ModulesSection } from "./ModulesSection";
import { PostSection } from "./PostSection";
import { SourceSection } from "./SourceSection";
import { ThemeSection } from "./ThemeSection";

export function LeftPanel() {
  return (
    <aside className="panel panel-left" aria-label="Настройки">
      <h1 className="brand">LOOPVIZ</h1>
      <SourceSection />
      <ModulesSection />
      <LayoutSection />
      <ThemeSection />
      <PostSection />
      <ExportSection />
    </aside>
  );
}
