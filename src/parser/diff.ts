import { DiagramSpec, DiagramNode, DiagramEdge } from './types';

export interface DiagramDelta {
  diagramTypeChanged: boolean;
  addedNodes: DiagramNode[];
  removedNodes: string[];
  updatedNodes: DiagramNode[];
  addedEdges: DiagramEdge[];
  removedEdges: DiagramEdge[];
  updatedEdges: DiagramEdge[];
}

export function computeSpecDiff(oldSpec: DiagramSpec | null, newSpec: DiagramSpec): DiagramDelta {
  if (!oldSpec) {
    return {
      diagramTypeChanged: true,
      addedNodes: newSpec.nodes,
      removedNodes: [],
      updatedNodes: [],
      addedEdges: newSpec.edges,
      removedEdges: [],
      updatedEdges: []
    };
  }

  const diagramTypeChanged = oldSpec.diagramType !== newSpec.diagramType;

  // Map nodes by ID
  const oldNodesMap = new Map<string, DiagramNode>(oldSpec.nodes.map(n => [n.id, n]));
  const newNodesMap = new Map<string, DiagramNode>(newSpec.nodes.map(n => [n.id, n]));

  const addedNodes: DiagramNode[] = [];
  const removedNodes: string[] = [];
  const updatedNodes: DiagramNode[] = [];

  // Find added and updated nodes
  newNodesMap.forEach((newNode, id) => {
    const oldNode = oldNodesMap.get(id);
    if (!oldNode) {
      addedNodes.push(newNode);
    } else {
      // Check if node content changed
      if (oldNode.label !== newNode.label || oldNode.type !== newNode.type || JSON.stringify(oldNode.meta) !== JSON.stringify(newNode.meta)) {
        updatedNodes.push(newNode);
      }
    }
  });

  // Find removed nodes
  oldNodesMap.forEach((_, id) => {
    if (!newNodesMap.has(id)) {
      removedNodes.push(id);
    }
  });

  // Helper to serialize edge key for identification
  const getEdgeKey = (edge: DiagramEdge) => `${edge.from}->${edge.to}`;

  const oldEdgesMap = new Map<string, DiagramEdge>(oldSpec.edges.map(e => [getEdgeKey(e), e]));
  const newEdgesMap = new Map<string, DiagramEdge>(newSpec.edges.map(e => [getEdgeKey(e), e]));

  const addedEdges: DiagramEdge[] = [];
  const removedEdges: DiagramEdge[] = [];
  const updatedEdges: DiagramEdge[] = [];

  newEdgesMap.forEach((newEdge, key) => {
    const oldEdge = oldEdgesMap.get(key);
    if (!oldEdge) {
      addedEdges.push(newEdge);
    } else {
      if (oldEdge.label !== newEdge.label || oldEdge.type !== newEdge.type) {
        updatedEdges.push(newEdge);
      }
    }
  });

  oldEdgesMap.forEach((oldEdge, key) => {
    if (!newEdgesMap.has(key)) {
      removedEdges.push(oldEdge);
    }
  });

  return {
    diagramTypeChanged,
    addedNodes,
    removedNodes,
    updatedNodes,
    addedEdges,
    removedEdges,
    updatedEdges
  };
}
