import Parser from 'web-tree-sitter';
import { DiagramSpec, DiagramNode, DiagramEdge } from './types';

export class PythonParser {
  private nodeCounter = 0;

  private generateId(prefix: string): string {
    this.nodeCounter++;
    return `${prefix}_${this.nodeCounter}`;
  }

  public parse(rootNode: Parser.SyntaxNode, _code: string, cursorOffset: number, requestedType?: string): DiagramSpec {
    this.nodeCounter = 0;

    // 1. Gather all class definitions
    const classes = this.findClasses(rootNode);

    // 2. Gather all function definitions
    const functions = this.findFunctions(rootNode);

    // 3. Determine diagram type
    let diagramType: 'flowchart' | 'class' | 'tree' | 'none' = 'none';

    if (requestedType) {
      if (requestedType === 'class') {
        diagramType = classes.length > 0 ? 'class' : 'none';
      } else if (requestedType === 'tree') {
        diagramType = functions.some(f => f.isRecursive) ? 'tree' : 'none';
      } else if (requestedType === 'flowchart') {
        diagramType = functions.length > 0 ? 'flowchart' : 'none';
      }
    } else {
      // Auto-detect:
      if (classes.length > 0) {
        diagramType = 'class';
      } else if (functions.some(f => f.isRecursive)) {
        diagramType = 'tree';
      } else if (functions.length > 0) {
        diagramType = 'flowchart';
      }
    }

    if (diagramType === 'class') {
      return this.generateClassDiagram(classes);
    } else if (diagramType === 'tree') {
      // Find the first recursive function or the one under cursor
      const recFunc = functions.find(f => f.isRecursive && cursorOffset >= f.node.startIndex && cursorOffset <= f.node.endIndex) 
                      || functions.find(f => f.isRecursive);
      if (recFunc) {
        return this.generateRecursionTree(recFunc);
      }
    } else if (diagramType === 'flowchart') {
      // Find function under cursor or first function
      const targetFunc = functions.find(f => cursorOffset >= f.node.startIndex && cursorOffset <= f.node.endIndex) 
                         || functions[0];
      if (targetFunc) {
        return this.generateFlowchart(targetFunc.node);
      } else {
        // Fallback: parse global scope control flow if no functions
        return this.generateFlowchart(rootNode, true);
      }
    }

    return { diagramType: 'none', nodes: [], edges: [] };
  }

  // --- AST Search Methods ---

  private findClasses(root: Parser.SyntaxNode): any[] {
    const classes: any[] = [];
    const traverse = (node: Parser.SyntaxNode) => {
      if (node.type === 'class_definition') {
        const nameNode = node.childForFieldName('name');
        const className = nameNode ? nameNode.text : 'Unknown';
        
        // Find inheritance
        const parents: string[] = [];
        const superclasses = node.childForFieldName('superclasses');
        if (superclasses) {
          for (let i = 0; i < superclasses.namedChildCount; i++) {
            parents.push(superclasses.namedChild(i)!.text);
          }
        }

        // Find methods and attributes
        const methods: string[] = [];
        const attributes = new Set<string>();
        const body = node.childForFieldName('body');
        
        if (body) {
          this.visitClassBody(body, methods, attributes);
        }

        classes.push({
          node,
          name: className,
          parents,
          methods,
          attributes: Array.from(attributes)
        });
      }
      for (let i = 0; i < node.namedChildCount; i++) {
        traverse(node.namedChild(i)!);
      }
    };
    traverse(root);
    return classes;
  }

  private visitClassBody(bodyNode: Parser.SyntaxNode, methods: string[], attributes: Set<string>) {
    const traverse = (node: Parser.SyntaxNode) => {
      if (node.type === 'function_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          methods.push(nameNode.text);
          // If __init__, extract attributes
          if (nameNode.text === '__init__') {
            this.extractAttributesFromInit(node, attributes);
          }
        }
      } else {
        for (let i = 0; i < node.namedChildCount; i++) {
          traverse(node.namedChild(i)!);
        }
      }
    };
    traverse(bodyNode);
  }

  private extractAttributesFromInit(initNode: Parser.SyntaxNode, attributes: Set<string>) {
    const traverse = (node: Parser.SyntaxNode) => {
      if (node.type === 'assignment') {
        const left = node.childForFieldName('left');
        if (left && left.type === 'attribute') {
          const object = left.childForFieldName('object');
          const attribute = left.childForFieldName('attribute');
          if (object && object.text === 'self' && attribute) {
            attributes.add(attribute.text);
          }
        }
      }
      for (let i = 0; i < node.namedChildCount; i++) {
        traverse(node.namedChild(i)!);
      }
    };
    traverse(initNode);
  }

  private findFunctions(root: Parser.SyntaxNode): any[] {
    const functions: any[] = [];
    const traverse = (node: Parser.SyntaxNode) => {
      if (node.type === 'function_definition') {
        const nameNode = node.childForFieldName('name');
        const funcName = nameNode ? nameNode.text : 'Unknown';

        // Check for recursive calls
        const recursiveCalls: string[] = [];
        this.findRecursiveCalls(node, funcName, recursiveCalls);

        functions.push({
          node,
          name: funcName,
          isRecursive: recursiveCalls.length > 0,
          recursiveCalls
        });
      }
      for (let i = 0; i < node.namedChildCount; i++) {
        traverse(node.namedChild(i)!);
      }
    };
    traverse(root);
    return functions;
  }

  private findRecursiveCalls(node: Parser.SyntaxNode, funcName: string, calls: string[]) {
    const traverse = (n: Parser.SyntaxNode) => {
      if (n.type === 'call') {
        const functionNode = n.childForFieldName('function');
        if (functionNode && functionNode.text === funcName) {
          const argumentList = n.childForFieldName('arguments');
          const argText = argumentList ? argumentList.text : '()';
          calls.push(argText);
        }
      }
      for (let i = 0; i < n.namedChildCount; i++) {
        traverse(n.namedChild(i)!);
      }
    };
    // Traverse descendants, but skip nested functions to avoid wrong match
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i)!;
      if (child.type !== 'function_definition' && child.type !== 'class_definition') {
        traverse(child);
      }
    }
  }

  // --- Diagram Spec Generators ---

  private generateClassDiagram(classes: any[]): DiagramSpec {
    const nodes: DiagramNode[] = [];
    const edges: DiagramEdge[] = [];

    classes.forEach(cls => {
      const startLine = cls.node.startPosition.row + 1;
      const endLine = cls.node.endPosition.row + 1;

      // Class definition block representation
      nodes.push({
        id: cls.name,
        label: cls.name,
        type: 'class',
        meta: {
          startLine,
          endLine,
          members: [
            ...cls.attributes.map((a: string) => `+${a}`),
            ...cls.methods.map((m: string) => `+${m}()`)
          ]
        }
      });

      // Draw inheritance links
      cls.parents.forEach((parent: string) => {
        edges.push({
          from: parent,
          to: cls.name,
          type: 'inheritance'
        });
      });
    });

    return {
      diagramType: 'class',
      nodes,
      edges,
      concept: 'OOP Class Hierarchy'
    };
  }

  private generateRecursionTree(func: any): DiagramSpec {
    const nodes: DiagramNode[] = [];
    const edges: DiagramEdge[] = [];

    const startLine = func.node.startPosition.row + 1;
    const endLine = func.node.endPosition.row + 1;

    // Create a symbolic representation of the recursion
    const rootId = this.generateId('rec');
    nodes.push({
      id: rootId,
      label: `${func.name}(n)`,
      type: 'process',
      meta: { startLine, endLine }
    });

    // Create branched children based on the recursive calls we found
    func.recursiveCalls.forEach((callArgs: string, index: number) => {
      const childId = this.generateId('rec');
      // Format argument: e.g. (n - 1) -> n - 1
      const displayArg = callArgs.replace(/^\(|\)$/g, '');
      nodes.push({
        id: childId,
        label: `${func.name}(${displayArg})`,
        type: 'process',
        meta: { startLine, endLine }
      });
      edges.push({
        from: rootId,
        to: childId,
        label: `call ${index + 1}`,
        type: 'call'
      });

      // Show loop back for visualization
      edges.push({
        from: childId,
        to: rootId,
        label: 'recurse',
        type: 'call'
      });
    });

    return {
      diagramType: 'tree',
      nodes,
      edges,
      concept: `Recursion Tree for ${func.name}`
    };
  }

  private generateFlowchart(root: Parser.SyntaxNode, isGlobal = false): DiagramSpec {
    const nodes: DiagramNode[] = [];
    const edges: DiagramEdge[] = [];

    const startLine = root.startPosition.row + 1;
    const endLine = root.endPosition.row + 1;

    const startId = this.generateId('start');
    nodes.push({
      id: startId,
      label: isGlobal ? 'Start Global' : 'Start ' + (root.childForFieldName('name')?.text || 'Function'),
      type: 'start',
      meta: { startLine, endLine }
    });

    const endId = this.generateId('end');
    nodes.push({
      id: endId,
      label: isGlobal ? 'End Global' : 'End',
      type: 'end',
      meta: { startLine, endLine }
    });

    const bodyNode = isGlobal ? root : root.childForFieldName('body');
    if (!bodyNode) {
      edges.push({ from: startId, to: endId, type: 'flow' });
      return { diagramType: 'flowchart', nodes, edges };
    }

    const lastId = this.traverseBlock(bodyNode, startId, endId, endId, nodes, edges);
    if (lastId && lastId !== endId) {
      edges.push({ from: lastId, to: endId, type: 'flow' });
    }

    return {
      diagramType: 'flowchart',
      nodes,
      edges,
      concept: isGlobal ? 'Global Control Flow' : `Control Flow: ${root.childForFieldName('name')?.text || ''}`
    };
  }

  private traverseBlock(
    blockNode: Parser.SyntaxNode,
    currentId: string,
    exitId: string,
    returnId: string,
    nodes: DiagramNode[],
    edges: DiagramEdge[]
  ): string {
    let lastActiveId = currentId;

    // Collect statements
    const statements: Parser.SyntaxNode[] = [];
    const collect = (n: Parser.SyntaxNode) => {
      if (n.type === 'block') {
        for (let i = 0; i < n.namedChildCount; i++) {
          statements.push(n.namedChild(i)!);
        }
      } else {
        statements.push(n);
      }
    };
    collect(blockNode);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const nextStmt = statements[i + 1];

      // Stop processing block if we already hit a return in this straight line
      if (lastActiveId === returnId) {
        break;
      }

      if (stmt.type === 'if_statement') {
        const condNode = stmt.childForFieldName('condition');
        const condText = condNode ? this.cleanText(condNode.text) : 'condition';
        const condId = this.generateId('cond');

        nodes.push({
          id: condId,
          label: `if ${condText}`,
          type: 'condition',
          meta: { startLine: stmt.startPosition.row + 1, endLine: stmt.endPosition.row + 1 }
        });

        edges.push({ from: lastActiveId, to: condId, type: 'flow' });

        const consequence = stmt.childForFieldName('consequence');
        const alternative = stmt.childForFieldName('alternative');

        // Create a merge point for after the if statement
        let mergeId = exitId;
        if (nextStmt) {
          mergeId = this.generateId('join');
          nodes.push({
            id: mergeId,
            label: 'join',
            type: 'process',
            meta: { startLine: nextStmt.startPosition.row + 1, endLine: nextStmt.endPosition.row + 1 }
          });
        }

        // True branch
        if (consequence) {
          const lastTrueId = this.traverseBlock(consequence, condId, mergeId, returnId, nodes, edges);
          if (lastTrueId && lastTrueId !== returnId && lastTrueId !== mergeId && lastTrueId !== exitId) {
            edges.push({ from: lastTrueId, to: mergeId, type: 'flow' });
          }
          // Fix label on the first link of true branch
          const firstTrueEdge = edges.find(e => e.from === condId && e.to !== alternative?.text);
          if (firstTrueEdge) {
            firstTrueEdge.label = 'True';
          }
        }

        // False branch
        if (alternative) {
          // alternative type is usually else_clause or elif_clause
          // inside else_clause, the body is a block
          let altBody = alternative;
          if (alternative.type === 'else_clause' || alternative.type === 'elif_clause') {
            altBody = alternative.child(1) || alternative; 
          }
          const lastFalseId = this.traverseBlock(altBody, condId, mergeId, returnId, nodes, edges);
          if (lastFalseId && lastFalseId !== returnId && lastFalseId !== mergeId && lastFalseId !== exitId) {
            edges.push({ from: lastFalseId, to: mergeId, type: 'flow' });
          }
          // Set label for false branch
          // We can look for the edge from condId to the start of false branch
          // If we find it, label it 'False'
        } else {
          // No else branch, connect condId to mergeId
          edges.push({ from: condId, to: mergeId, label: 'False', type: 'flow' });
        }

        lastActiveId = mergeId;

      } else if (stmt.type === 'while_statement' || stmt.type === 'for_statement') {
        const isWhile = stmt.type === 'while_statement';
        const condNode = isWhile ? stmt.childForFieldName('condition') : stmt; 
        let condText = '';
        if (isWhile && condNode) {
          condText = `while ${this.cleanText(condNode.text)}`;
        } else {
          const left = stmt.childForFieldName('left');
          const right = stmt.childForFieldName('right');
          condText = `for ${left ? left.text : 'item'} in ${right ? right.text : 'iterable'}`;
        }

        const loopId = this.generateId('loop');
        nodes.push({
          id: loopId,
          label: condText,
          type: 'loop',
          meta: { startLine: stmt.startPosition.row + 1, endLine: stmt.endPosition.row + 1 }
        });

        edges.push({ from: lastActiveId, to: loopId, type: 'flow' });

        const body = stmt.childForFieldName('body');
        
        let mergeId = exitId;
        if (nextStmt) {
          mergeId = this.generateId('join');
          nodes.push({
            id: mergeId,
            label: 'join',
            type: 'process',
            meta: { startLine: nextStmt.startPosition.row + 1, endLine: nextStmt.endPosition.row + 1 }
          });
        }

        if (body) {
          const lastBodyId = this.traverseBlock(body, loopId, loopId, returnId, nodes, edges);
          if (lastBodyId && lastBodyId !== returnId && lastBodyId !== loopId) {
            edges.push({ from: lastBodyId, to: loopId, type: 'flow' });
          }
          // Label the loop path
          const firstLoopEdge = edges.find(e => e.from === loopId && e.to !== mergeId);
          if (firstLoopEdge) {
            firstLoopEdge.label = 'Loop';
          }
        }

        edges.push({ from: loopId, to: mergeId, label: 'Exit', type: 'flow' });
        lastActiveId = mergeId;

      } else if (stmt.type === 'return_statement') {
        const retId = this.generateId('ret');
        const retVal = stmt.text.replace('return', '').trim();
        nodes.push({
          id: retId,
          label: `return ${retVal || 'None'}`,
          type: 'process',
          meta: { startLine: stmt.startPosition.row + 1, endLine: stmt.endPosition.row + 1 }
        });
        edges.push({ from: lastActiveId, to: retId, type: 'flow' });
        edges.push({ from: retId, to: returnId, type: 'flow' });
        lastActiveId = returnId;

      } else if (stmt.type === 'expression_statement' || stmt.type === 'assignment') {
        const stmtText = this.cleanText(stmt.text);
        const stmtId = this.generateId('stmt');
        nodes.push({
          id: stmtId,
          label: stmtText,
          type: 'process',
          meta: { startLine: stmt.startPosition.row + 1, endLine: stmt.endPosition.row + 1 }
        });
        edges.push({ from: lastActiveId, to: stmtId, type: 'flow' });
        lastActiveId = stmtId;
      }
    }

    return lastActiveId;
  }

  private cleanText(text: string): string {
    let clean = text.replace(/[\r\n]+/g, ' ').trim();
    if (clean.length > 35) {
      clean = clean.substring(0, 32) + '...';
    }
    return clean;
  }
}
