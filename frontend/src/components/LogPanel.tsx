import type { ReactNode } from 'react';

interface LogPanelProps {
  logs: string[];
}

export default function LogPanel({ logs }: LogPanelProps): ReactNode {
  return (
    <section className="card log-card">
      <div className="terminal-header">
        <div aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h2>处理日志</h2>
      </div>
      <div className="log-box">
        {logs.length === 0 ? (
          <p className="subtle">暂无日志</p>
        ) : (
          logs.map((log, index) => <p key={`${log}_${index}`}>{log}</p>)
        )}
      </div>
    </section>
  );
}
