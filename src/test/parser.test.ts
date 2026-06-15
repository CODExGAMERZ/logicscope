import * as path from 'path';

// Mock the 'vscode' module before importing parser files
const moduleAlias = require('module');
const originalRequire = moduleAlias.prototype.require;
moduleAlias.prototype.require = function (this: any, name: string) {
  if (name === 'vscode') {
    return {
      window: {
        createOutputChannel: (title: string) => ({
          appendLine: (msg: string) => console.log(`[OutputChannel: ${title}] ${msg}`),
          show: () => {}
        })
      }
    };
  }
  return originalRequire.apply(this, arguments);
};

// Now import after the mock is registered
async function runTests() {
  console.log('--- Starting LogicScope Parser Tests ---');
  
  // Use dynamic imports with .js extension as required by Node16 resolution
  const { TreeSitterParser } = await import('../parser/treeSitterParser.js');
  const { PythonParser } = await import('../parser/pythonParser.js');
  const { JavaScriptParser } = await import('../parser/javascriptParser.js');
  const { Logger } = await import('../utils/logger.js');

  // Mock Logger to console for tests
  Logger.log = (msg: string) => console.log(`[LOG] ${msg}`);
  Logger.error = (msg: string, err?: any) => console.error(`[ERROR] ${msg}`, err || '');
  Logger.warn = (msg: string) => console.warn(`[WARN] ${msg}`);

  const projectRoot = path.join(__dirname, '..', '..');
  
  // Initialize Parser
  console.log('Initializing Tree-sitter WASM...');
  await TreeSitterParser.init(projectRoot);

  const pyParser = new PythonParser();
  const jsParser = new JavaScriptParser();

  // Test 1: Python Flowchart
  console.log('\nTest 1: Python Control Flow parsing...');
  const pyCode = `
def process_number(x):
    if x > 10:
        print("large")
        return x * 2
    else:
        y = x + 1
        while y < 10:
            y = y + 1
        return y
  `;
  const pyTreeSitter = TreeSitterParser.getParser('python');
  if (pyTreeSitter) {
    const tree = pyTreeSitter.parse(pyCode);
    const spec = pyParser.parse(tree.rootNode, pyCode, 0, 'flowchart');
    console.log(`Successfully generated spec with ${spec.nodes.length} nodes and ${spec.edges.length} edges.`);
    console.log('Diagram Type:', spec.diagramType);
    console.log('Generated Nodes:', spec.nodes.map((n: any) => `(${n.id}: ${n.label} [${n.type}])`).join(', '));
  } else {
    throw new Error('Could not get python parser');
  }

  // Test 2: JavaScript Class Diagram
  console.log('\nTest 2: JavaScript Class Hierarchy parsing...');
  const jsCode = `
class Shape {
  constructor() {
    this.color = 'red';
  }
  draw() {}
}

class Circle extends Shape {
  constructor(radius) {
    super();
    this.radius = radius;
  }
  draw() {
    console.log("circle");
  }
}
  `;
  const jsTreeSitter = TreeSitterParser.getParser('javascript');
  if (jsTreeSitter) {
    const tree = jsTreeSitter.parse(jsCode);
    const spec = jsParser.parse(tree.rootNode, jsCode, 0, 'class');
    console.log(`Successfully generated spec with ${spec.nodes.length} nodes and ${spec.edges.length} edges.`);
    console.log('Diagram Type:', spec.diagramType);
    console.log('Generated Classes:', spec.nodes.map((n: any) => `${n.label} { ${n.meta?.members?.join(', ') || ''} }`).join('\n'));
    
    // Check inheritance link
    const inheritanceEdge = spec.edges.find((e: any) => e.type === 'inheritance');
    console.log('Inheritance Link:', inheritanceEdge ? `${inheritanceEdge.from} <|-- ${inheritanceEdge.to}` : 'None found');
  } else {
    throw new Error('Could not get javascript parser');
  }

  // Test 3: Python Recursion Tree
  console.log('\nTest 3: Python Recursion detection...');
  const pyRecCode = `
def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)
  `;
  if (pyTreeSitter) {
    const tree = pyTreeSitter.parse(pyRecCode);
    const spec = pyParser.parse(tree.rootNode, pyRecCode, 0);
    console.log('Detected Diagram Type:', spec.diagramType);
    console.log('Generated Nodes:', spec.nodes.map((n: any) => `${n.id}: ${n.label}`).join(', '));
    console.log('Edges:');
    spec.edges.forEach((e: any) => console.log(`  ${e.from} --(${e.label || ''})--> ${e.to}`));
  }

  console.log('\n--- All Parser Tests Completed Successfully ---');
}

runTests().catch(err => {
  console.error('Test execution failed!', err);
  process.exit(1);
});
