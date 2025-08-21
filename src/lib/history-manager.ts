import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { HistoryEntry, HistoryConfig } from '../types.js';

export class HistoryManager {
  private config: HistoryConfig;
  private historyPath: string;

  constructor(config: HistoryConfig) {
    this.config = config;
    this.historyPath = this.resolveHistoryPath(config.location);
  }

  private resolveHistoryPath(location: string): string {
    // Resolve environment variables in path
    const resolved = location.replace(/\${([^}]+)}/g, (match, expr: string) => {
      const [varName, defaultVal] = expr.split(':-');
      return process.env[varName] || defaultVal || '';
    });

    // Resolve ~ to home directory
    if (resolved.startsWith('~')) {
      return path.join(process.env.HOME || '', resolved.slice(1));
    }

    return resolved;
  }

  async add(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const newEntry: HistoryEntry = {
      ...entry,
      id: crypto.randomBytes(8).toString('hex'),
      timestamp: Date.now(),
    };

    const history = await this.load();
    history.unshift(newEntry);

    // Limit history size
    if (history.length > this.config.maxEntries) {
      history.splice(this.config.maxEntries);
    }

    await this.save(history);
  }

  async load(): Promise<HistoryEntry[]> {
    try {
      const content = await fs.readFile(this.historyPath, 'utf-8');
      return JSON.parse(content) as HistoryEntry[];
    } catch (error: unknown) {
      if ((error as { code: string }).code === 'ENOENT') {
        // History file doesn't exist yet
        return [];
      }
      console.error('Failed to load history:', (error as Error).message);
      return [];
    }
  }

  async save(history: HistoryEntry[]): Promise<void> {
    const dir = path.dirname(this.historyPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.historyPath, JSON.stringify(history, null, 2), 'utf-8');
  }

  async getLast(n: number = 10): Promise<HistoryEntry[]> {
    const history = await this.load();
    return history.slice(0, n);
  }

  async getById(id: string): Promise<HistoryEntry | null> {
    const history = await this.load();
    return history.find((entry) => entry.id === id) || null;
  }

  async search(query: string): Promise<HistoryEntry[]> {
    const history = await this.load();
    const lowerQuery = query.toLowerCase();

    return history.filter(
      (entry) =>
        entry.command.toLowerCase().includes(lowerQuery) ||
        entry.prompt.toLowerCase().includes(lowerQuery) ||
        entry.response.toLowerCase().includes(lowerQuery),
    );
  }

  async getLastResponse(): Promise<HistoryEntry | null> {
    const history = await this.load();
    return history[0] || null;
  }

  async clear(): Promise<void> {
    await this.save([]);
  }

  formatEntry(entry: HistoryEntry): string {
    const date = new Date(entry.timestamp);
    const dateStr = date.toLocaleString();
    const paramStr = Object.keys(entry.params).length > 0 ? ` ${JSON.stringify(entry.params)}` : '';

    return `[${dateStr}] ${entry.command}${paramStr} (${entry.duration}ms)\nID: ${entry.id}`;
  }
}
