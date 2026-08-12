import React, { useEffect, useRef, useState } from 'react';

interface MermaidRendererProps {
  chart: string;
  id?: string;
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    const renderChart = async () => {
      // Mermaid is ~critical-path-sized and only the docs page ever needs it.
      // Importing it here keeps it out of the prerender (it touches the DOM at
      // module scope) and out of the bundle every other page downloads.
      const { default: mermaid } = await import('mermaid');
      if (cancelled) return;

      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          darkMode: true,
          background: '#09090b',
          primaryColor: '#4f46e5',
          primaryTextColor: '#f4f4f5',
          primaryBorderColor: '#6366f1',
          lineColor: '#818cf8',
          secondaryColor: '#9333ea',
          tertiaryColor: '#18181b',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif'
        },
        // Diagrams come from this repo's own docs, never from user input.
        securityLevel: 'strict'
      });

      try {
        setError('');
        const uniqueId = `mermaid_${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await mermaid.render(uniqueId, chart);
        if (!cancelled) setSvgContent(svg);
      } catch (err: any) {
        console.error('Mermaid render error:', err);
        if (!cancelled) setError('Failed to render diagram.');
      }
    };

    void renderChart();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono">
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="p-6 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 overflow-x-auto flex justify-center items-center backdrop-blur-xl shadow-inner custom-scrollbar my-6"
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
};
