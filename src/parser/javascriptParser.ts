import Parser from 'web-tree-sitter';
import { DiagramSpec, DiagramNode, DiagramEdge } from './types';

export class JavaScriptParser {
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
      const recFunc = functions.find(f => f.isRecursive && cursorOffset >= f.node.startIndex && cursorOffset <= f.node.endIndex) 
                      || functions.find(f => f.isRecursive);
      if (recFunc) {
        return this.generateRecursionTree(recFunc);
      }
    } else if (diagramType === 'flowchart') {
      const targetFunc = functions.find(f => cursorOffset >= f.node.startIndex && cursorOffset <= f.node.endIndex) 
                         || functions[0];
      if (targetFunc) {
        return this.generateFlowchart(targetFunc.node);
      } else {
        return this.generateFlowchart(rootNode, true);
      }
    }

    return { diagramType: 'none', nodes: [], edges: [] };
  }

  // --- AST Search Methods ---

  private findClasses(root: Parser.SyntaxNode): any[] {
    const classes: any[] = [];
    const traverse = (node: Parser.SyntaxNode) => {
      if (node.type === 'class_declaration' || node.type === 'class') {
        const nameNode = node.childForFieldName('name');
        const className = nameNode ? nameNode.text : 'Unknown';

        // Find inheritance
        const parents: string[] = [];
        const heritage = node.children.find(c => c.type === 'class_heritage');
        if (heritage) {
          for (let i = 0; i < heritage.namedChildCount; i++) {
            parents.push(heritage.namedChild(i)!.text);
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
    for (let i = 0; i < bodyNode.namedChildCount; i++) {
      const child = bodyNode.namedChild(i)!;
      if (child.type === 'method_definition') {
        const nameNode = child.childForFieldName('name');
        if (nameNode) {
          methods.push(nameNode.text);
          if (nameNode.text === 'constructor') {
            this.extractAttributesFromConstructor(child, attributes);
          }
        }
      } else if (child.type === 'public_field_definition') {
        const nameNode = child.childForFieldName('name');
        if (nameNode) {
          attributes.add(nameNode.text);
        }
      }
    }
  }

  private extractAttributesFromConstructor(constructorNode: Parser.SyntaxNode, attributes: Set<string>) {
    const traverse = (node: Parser.SyntaxNode) => {
      if (node.type === 'assignment_expression') {
        const left = node.childForFieldName('left');
        if (left && left.type === 'member_expression') {
          const object = left.childForFieldName('object');
          const property = left.childForFieldName('property');
          if (object && object.text === 'this' && property) {
            attributes.add(property.text);
          }
        }
      }
      for (let i = 0; i < node.namedChildCount; i++) {
        traverse(node.namedChild(i)!);
      }
    };
    traverse(constructorNode);
  }

  private findFunctions(root: Parser.SyntaxNode): any[] {
    const functions: any[] = [];
    const traverse = (node: Parser.SyntaxNode) => {
      if (node.type === 'function_declaration' || node.type === 'method_definition') {
        const nameNode = node.childForFieldName('name');
        const funcName = nameNode ? nameNode.text : 'Unknown';

        const recursiveCalls: string[] = [];
        this.findRecursiveCalls(node, funcName, recursiveCalls);

        functions.push({
          node,
          name: funcName,
          isRecursive: recursiveCalls.length > 0,
          recursiveCalls
        });
      } else if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
        // Detect function expressions: const foo = () => {} or const foo = function() {}
        const declarator = node.namedChild(0);
        if (declarator && declarator.type === 'variable_declarator') {
          const nameNode = declarator.childForFieldName('name');
          const valueNode = declarator.childForFieldName('value');
          if (nameNode && valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function_expression')) {
            const funcName = nameNode.text;
            const recursiveCalls: string[] = [];
            this.findRecursiveCalls(valueNode, funcName, recursiveCalls);

            functions.push({
              node: valueNode,
              name: funcName,
              isRecursive: recursiveCalls.length > 0,
              recursiveCalls
            });
          }
        }
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
      if (n.type === 'call_expression') {
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
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i)!;
      if (child.type !== 'function_declaration' && child.type !== 'class_declaration') {
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

    const rootId = this.generateId('rec');
    nodes.push({
      id: rootId,
      label: `${func.name}(n)`,
      type: 'process',
      meta: { startLine, endLine }
    });

    func.recursiveCalls.forEach((callArgs: string, index: number) => {
      const childId = this.generateId('rec');
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

    const nameNode = root.childForFieldName('name');
    const funcName = nameNode ? nameNode.text : (isGlobal ? 'Global' : 'Function');

    const startId = this.generateId('start');
    nodes.push({
      id: startId,
      label: `Start ${funcName}`,
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
      concept: isGlobal ? 'Global Control Flow' : `Control Flow: ${funcName}`
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
      if (n.type === 'statement_block' || n.type === 'block') {
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

        if (consequence) {
          const lastTrueId = this.traverseBlock(consequence, condId, mergeId, returnId, nodes, edges);
          if (lastTrueId && lastTrueId !== returnId && lastTrueId !== mergeId && lastTrueId !== exitId) {
            edges.push({ from: lastTrueId, to: mergeId, type: 'flow' });
          }
          const firstTrueEdge = edges.find(e => e.from === condId && e.to !== alternative?.text);
          if (firstTrueEdge) {
            firstTrueEdge.label = 'True';
          }
        }

        if (alternative) {
          let altBody = alternative;
          if (alternative.type === 'else_clause') {
            altBody = alternative.child(1) || alternative; 
          }
          const lastFalseId = this.traverseBlock(altBody, condId, mergeId, returnId, nodes, edges);
          if (lastFalseId && lastFalseId !== returnId && lastFalseId !== mergeId && lastFalseId !== exitId) {
            edges.push({ from: lastFalseId, to: mergeId, type: 'flow' });
          }
        } else {
          edges.push({ from: condId, to: mergeId, label: 'False', type: 'flow' });
        }

        lastActiveId = mergeId;

      } else if (stmt.type === 'while_statement' || stmt.type === 'for_statement' || stmt.type === 'for_in_statement') {
        const isWhile = stmt.type === 'while_statement';
        const condNode = isWhile ? stmt.childForFieldName('condition') : stmt;
        let condText = '';
        if (isWhile && condNode) {
          condText = `while ${this.cleanText(condNode.text)}`;
        } else {
          condText = `for ${this.cleanText(stmt.text.split('{')[0].replace('for', '').trim())}`;
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
          const firstLoopEdge = edges.find(e => e.from === loopId && e.to !== mergeId);
          if (firstLoopEdge) {
            firstLoopEdge.label = 'Loop';
          }
        }

        edges.push({ from: loopId, to: mergeId, label: 'Exit', type: 'flow' });
        lastActiveId = mergeId;

      } else if (stmt.type === 'return_statement') {
        const retId = this.generateId('ret');
        const retVal = stmt.text.replace('return', '').replace(';', '').trim();
        nodes.push({
          id: retId,
          label: `return ${retVal || 'undefined'}`,
          type: 'process',
          meta: { startLine: stmt.startPosition.row + 1, endLine: stmt.endPosition.row + 1 }
        });
        edges.push({ from: lastActiveId, to: retId, type: 'flow' });
        edges.push({ from: retId, to: returnId, type: 'flow' });
        lastActiveId = returnId;

      } else if (stmt.type === 'expression_statement' || stmt.type === 'lexical_declaration' || stmt.type === 'variable_declaration') {
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
    let clean = text.replace(/;$/, '').replace(/[\r\n]+/g, ' ').trim();
    if (clean.length > 35) {
      clean = clean.substring(0, 32) + '...';
    }
    return clean;
  }
}
