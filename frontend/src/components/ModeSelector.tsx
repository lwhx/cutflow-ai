import type { ReactNode } from 'react';
import type { TaskMode } from '../types/task';

interface ModeSelectorProps {
  mode: TaskMode;
  onChange: (mode: TaskMode) => void;
}

export default function ModeSelector({ mode, onChange }: ModeSelectorProps): ReactNode {
  return (
    <section className="card mode-card">
      <div>
        <h2>处理模式</h2>
        <p>{mode === 'single' ? '单图模式会逐张处理上传图片。' : '批量模式会按每 5 张自动分批处理。'}</p>
      </div>
      <div className="mode-actions">
        <button className={mode === 'single' ? 'active' : ''} onClick={() => onChange('single')} type="button">
          单图扣图
        </button>
        <button className={mode === 'batch' ? 'active' : ''} onClick={() => onChange('batch')} type="button">
          批量扣图
        </button>
      </div>
    </section>
  );
}
