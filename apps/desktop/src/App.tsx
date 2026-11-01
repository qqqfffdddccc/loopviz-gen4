import { LeftPanel } from "./panels/LeftPanel";
import { Preview } from "./panels/Preview";
import { RightPanel } from "./panels/RightPanel";

export function App() {
  return (
    <div className="app">
      <LeftPanel />
      <Preview />
      <RightPanel />
    </div>
  );
}
