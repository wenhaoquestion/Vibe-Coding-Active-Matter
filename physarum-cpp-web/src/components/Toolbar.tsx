import { Apple, Eraser, MousePointer2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { ToolMode } from "../state/types";

interface ToolbarProps {
  activeTool: ToolMode;
  onToolChange: (tool: ToolMode) => void;
}

const tools: Array<{ id: ToolMode; label: string; icon: ReactNode }> = [
  { id: "inspect", label: "Inspect", icon: <MousePointer2 size={18} /> },
  { id: "slime", label: "Add slime", icon: <Sparkles size={18} /> },
  { id: "food", label: "Add food", icon: <Apple size={18} /> },
  { id: "erase", label: "Erase", icon: <Eraser size={18} /> }
];

export function Toolbar({ activeTool, onToolChange }: ToolbarProps) {
  return (
    <nav className="toolbar" aria-label="Canvas tools">
      {tools.map((tool) => (
        <button
          key={tool.id}
          className={activeTool === tool.id ? "tool active" : "tool"}
          title={tool.label}
          aria-label={tool.label}
          onClick={() => onToolChange(tool.id)}
        >
          {tool.icon}
        </button>
      ))}
    </nav>
  );
}
