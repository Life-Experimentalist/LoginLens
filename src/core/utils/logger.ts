import { extensionStorage } from "../storage/config";

export interface LogEntry {
  timestamp: number;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  message: string;
  data?: any;
}

const MAX_LOGS = 1000;

class Logger {
  private async addLog(level: LogEntry["level"], message: string, data?: any) {
    // Determine debug mode (default to true in dev, false in prod)
    const defaultDebug = process.env.NODE_ENV === 'development';
    const isDebug = await extensionStorage.get<boolean>("debug_mode");
    const debugEnabled = isDebug !== undefined ? isDebug : defaultDebug;
    
    if (level === "DEBUG" && !debugEnabled) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data
    };

    const consoleMethod = level === "DEBUG" ? "log" : level.toLowerCase();
    if (data) {
      (console as any)[consoleMethod](`[${level}] ${message}`, data);
    } else {
      (console as any)[consoleMethod](`[${level}] ${message}`);
    }

    try {
      const logs = await extensionStorage.get<LogEntry[]>("app_logs") || [];
      logs.push(entry);
      if (logs.length > MAX_LOGS) {
        logs.splice(0, logs.length - MAX_LOGS);
      }
      await extensionStorage.set("app_logs", logs);
    } catch (e) {
      console.error("Failed to write to log storage", e);
    }
  }

  info(message: string, data?: any) { this.addLog("INFO", message, data); }
  warn(message: string, data?: any) { this.addLog("WARN", message, data); }
  error(message: string, data?: any) { this.addLog("ERROR", message, data); }
  debug(message: string, data?: any) { this.addLog("DEBUG", message, data); }
  
  async getLogs(): Promise<LogEntry[]> {
    return await extensionStorage.get<LogEntry[]>("app_logs") || [];
  }
  
  async clearLogs() {
    await extensionStorage.set("app_logs", []);
  }
}

export const log = new Logger();
