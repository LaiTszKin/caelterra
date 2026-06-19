import type {
  CodeGraphNode,
  CodeGraphEdge,
  CodeGraphSubgraph,
} from './cg-instance.js';

export function serializeNode(node: CodeGraphNode): Record<string, unknown> {
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    qualifiedName: node.qualifiedName,
    filePath: node.filePath,
    language: node.language,
    startLine: node.startLine,
    endLine: node.endLine,
    signature: node.signature,
    isExported: node.isExported,
  };
}

export function serializeEdge(
  edge: CodeGraphEdge,
  nodesById?: Map<string, CodeGraphNode>,
): Record<string, unknown> {
  return {
    source: edge.source,
    sourceName: nodesById?.get(edge.source)?.name,
    target: edge.target,
    targetName: nodesById?.get(edge.target)?.name,
    kind: edge.kind,
    line: edge.line,
    metadata: edge.metadata,
    provenance: edge.provenance,
  };
}

export function serializeSubgraph(
  subgraph: CodeGraphSubgraph,
): Record<string, unknown> {
  const nodes = Array.from(subgraph.nodes.values());
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return {
    roots: subgraph.roots,
    confidence: subgraph.confidence,
    nodes: nodes.map(serializeNode),
    edges: subgraph.edges.map((edge) => serializeEdge(edge, nodesById)),
  };
}
