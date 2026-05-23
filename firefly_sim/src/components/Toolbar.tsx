import type { ToolMode } from '../state/types';

const tools: Array<{ id: ToolMode; icon: string; label: string }> = [
  { id: 'inspect', icon: 'i', label: 'Inspect fireflies' },
  { id: 'add', icon: '+', label: 'Add fireflies' },
  { id: 'erase', icon: '-', label: 'Erase fireflies' },
  { id: 'obstacle', icon: 'O', label: 'Add forest obstacle' },
  { id: 'city', icon: '*', label: 'Add city light' },
  { id: 'bat', icon: 'B', label: 'Add bat predator' }
];

interface ToolbarProps {
  tool: ToolMode;
  onToolChange: (tool: ToolMode) => void;
  paused: boolean;
  onTogglePaused: () => void;
  onStep: () => void;
  onReset: () => void;
}

export function Toolbar({ tool, onToolChange, paused, onTogglePaused, onStep, onReset }: ToolbarProps) {
  return (
    <div className="toolbar" aria-label="simulation tools">
      {tools.map((item) => (
        <button
          key={item.id}
          className={tool === item.id ? 'active' : ''}
          title={item.label}
          aria-label={item.label}
          onClick={() => onToolChange(item.id)}
        >
          {item.icon}
        </button>
      ))}
      <span className="toolbar-divider" />
      <button title="Play or pause" onClick={onTogglePaused}>{paused ? 'Play' : 'Pause'}</button>
      <button title="Advance one simulation frame" onClick={onStep}>Step</button>
      <button title="Reset with current seed" onClick={onReset}>Reset</button>
    </div>
  );
}
