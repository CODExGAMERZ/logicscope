import * as vscode from 'vscode';

export class Logger {
  private static channel: vscode.OutputChannel | null = null;

  public static initialize() {
    if (!Logger.channel) {
      Logger.channel = vscode.window.createOutputChannel("LogicScope");
    }
  }

  public static log(message: string) {
    Logger.initialize();
    Logger.channel?.appendLine(`[INFO] [${new Date().toISOString()}] ${message}`);
  }

  public static warn(message: string) {
    Logger.initialize();
    Logger.channel?.appendLine(`[WARN] [${new Date().toISOString()}] ${message}`);
  }

  public static error(message: string, error?: any) {
    Logger.initialize();
    Logger.channel?.appendLine(`[ERROR] [${new Date().toISOString()}] ${message}`);
    if (error) {
      Logger.channel?.appendLine(error.stack || String(error));
    }
  }

  public static show() {
    Logger.channel?.show();
  }
}
