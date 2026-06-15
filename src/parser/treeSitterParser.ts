import * as path from 'path';
import * as fs from 'fs';
import Parser from 'web-tree-sitter';
import { Logger } from '../utils/logger';

export class TreeSitterParser {
  private static initialized = false;
  private static pythonLanguage: Parser.Language | null = null;
  private static javascriptLanguage: Parser.Language | null = null;

  public static async init(extensionPath: string) {
    if (this.initialized) {
      return;
    }

    try {
      const wasmDir = path.join(extensionPath, 'dist');
      Logger.log(`Initializing Tree-sitter WASM from ${wasmDir}`);

      await Parser.init({
        locateFile: (scriptName: string) => {
          const wasmPath = path.join(wasmDir, scriptName);
          return wasmPath;
        }
      });

      const pythonWasmPath = path.join(wasmDir, 'tree-sitter-python.wasm');
      if (fs.existsSync(pythonWasmPath)) {
        this.pythonLanguage = await Parser.Language.load(pythonWasmPath);
        Logger.log('Loaded tree-sitter-python.wasm');
      } else {
        Logger.error(`Python WASM grammar not found at: ${pythonWasmPath}`);
      }

      const javascriptWasmPath = path.join(wasmDir, 'tree-sitter-javascript.wasm');
      if (fs.existsSync(javascriptWasmPath)) {
        this.javascriptLanguage = await Parser.Language.load(javascriptWasmPath);
        Logger.log('Loaded tree-sitter-javascript.wasm');
      } else {
        Logger.error(`JavaScript WASM grammar not found at: ${javascriptWasmPath}`);
      }

      this.initialized = true;
    } catch (error) {
      Logger.error('Failed to initialize Tree-sitter Parser', error);
      throw error;
    }
  }

  public static getParser(languageId: string): Parser | null {
    if (!this.initialized) {
      Logger.error('TreeSitterParser not initialized!');
      return null;
    }

    let language: Parser.Language | null = null;
    if (languageId === 'python') {
      language = this.pythonLanguage;
    } else if (languageId === 'javascript') {
      language = this.javascriptLanguage;
    }

    if (!language) {
      Logger.warn(`No parser language found for languageId: ${languageId}`);
      return null;
    }

    const parser = new Parser();
    parser.setLanguage(language);
    return parser;
  }
}
