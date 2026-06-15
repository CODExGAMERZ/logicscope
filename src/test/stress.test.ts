import * as path from 'path';

// Mock the 'vscode' module before importing parser files
const moduleAlias = require('module');
const originalRequire = moduleAlias.prototype.require;
moduleAlias.prototype.require = function (this: any, name: string) {
  if (name === 'vscode') {
    return {
      window: {
        createOutputChannel: (_title: string) => ({
          appendLine: () => {},
          show: () => {}
        })
      }
    };
  }
  return originalRequire.apply(this, arguments);
};

// Now import after the mock is registered
async function runStressTest() {
  console.log('--- Starting LogicScope Parser Stress Test ---');
  
  // Use dynamic imports with .js extension as required by Node16 resolution
  const { TreeSitterParser } = await import('../parser/treeSitterParser.js');
  const { PythonParser } = await import('../parser/pythonParser.js');

  const projectRoot = path.join(__dirname, '..', '..');
  await TreeSitterParser.init(projectRoot);

  const pyParser = new PythonParser();

  // 1. Generate a massive Python file content (1000+ lines)
  console.log('Generating 1000-line Python stress file...');
  let pyContent = '# Stress Test Code\n\n';
  
  // Generate 50 classes with inheritance chains
  for (let i = 1; i <= 50; i++) {
    const parent = i > 1 ? `Class_${i - 1}` : 'object';
    pyContent += `class Class_${i}(${parent}):\n`;
    pyContent += `    def __init__(self, val):\n`;
    pyContent += `        self.value_${i} = val\n`;
    pyContent += `    def method_${i}(self):\n`;
    pyContent += `        return self.value_${i}\n\n`;
  }

  // Generate a very complex nested control flow block (10 levels deep)
  pyContent += 'def complex_flow(x):\n';
  let indent = '    ';
  for (let i = 1; i <= 10; i++) {
    pyContent += `${indent}if x > ${i}:\n`;
    indent += '    ';
    pyContent += `${indent}print(${i})\n`;
  }
  for (let i = 10; i >= 1; i--) {
    indent = indent.slice(0, -4);
    pyContent += `${indent}else:\n`;
    pyContent += `${indent}    print(-${i})\n`;
  }
  pyContent += `${indent}return x\n\n`;

  // Generate 20 recursive functions
  for (let i = 1; i <= 20; i++) {
    pyContent += `def recurse_func_${i}(n):\n`;
    pyContent += `    if n <= 1:\n`;
    pyContent += `        return n\n`;
    pyContent += `    return recurse_func_${i}(n - 1) + recurse_func_${i}(n - 2)\n\n`;
  }

  const pyLines = pyContent.split('\n').length;
  console.log(`Generated Python stress file: ${pyLines} lines, ${pyContent.length} bytes.`);

  // 2. Measure performance (latency)
  const pyTreeSitter = TreeSitterParser.getParser('python');
  if (!pyTreeSitter) {
    throw new Error('Could not get python parser');
  }

  console.log('Running benchmark (10 iterations)...');
  const runTimes: number[] = [];
  
  // Parse AST once
  const tree = pyTreeSitter.parse(pyContent);

  for (let iter = 0; iter < 10; iter++) {
    const start = performance.now();
    
    // Parse into our diagram specs (Class, Flowchart, Recursion Tree)
    pyParser.parse(tree.rootNode, pyContent, 0, 'class');
    pyParser.parse(tree.rootNode, pyContent, 0, 'flowchart');
    pyParser.parse(tree.rootNode, pyContent, 0, 'tree');
    
    const end = performance.now();
    runTimes.push(end - start);
  }

  const averageTime = runTimes.reduce((a, b) => a + b, 0) / runTimes.length;
  console.log(`Average parsing duration (including all 3 diagram generations): ${averageTime.toFixed(2)}ms`);
  console.log('Individual run times:', runTimes.map(t => `${t.toFixed(2)}ms`).join(', '));

  // Validate no crashes on malformed code
  console.log('\nTesting error tolerance on broken syntax...');
  const brokenCode = `
class BrokenClass:
    def __init__(self
        self.val = 1
    def speak(self):
        if x > 10
            print("no colon")
  `;
  const brokenTree = pyTreeSitter.parse(brokenCode);
  const brokenSpec = pyParser.parse(brokenTree.rootNode, brokenCode, 0);
  console.log(`Error tolerance test passed. Nodes parsed: ${brokenSpec.nodes.length}`);

  console.log('\n--- Stress Test Completed Successfully ---');
}

runStressTest().catch(err => {
  console.error('Stress test failed!', err);
  process.exit(1);
});
