export interface DiagramNode {
  id: string;
  label: string;
  type: 'process' | 'condition' | 'start' | 'end' | 'class' | 'call' | 'loop' | 'class_member';
  meta?: {
    startLine?: number;
    endLine?: number;
    className?: string;
    members?: string[];
    isStatic?: boolean;
    [key: string]: any;
  };
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  type?: 'flow' | 'inheritance' | 'call' | 'composition' | 'association';
}

export interface DiagramSpec {
  diagramType: 'flowchart' | 'class' | 'tree' | 'none';
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  concept?: string;
  explanation?: string;
  complexity?: {
    time: string;
    space: string;
  };
}
