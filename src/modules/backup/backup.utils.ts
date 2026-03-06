import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import extract from 'extract-zip';

const BACKUP_DIR = path.join(process.cwd(), 'backups');
const MANUAL_DIR = path.join(BACKUP_DIR, 'manual');
const AUTO_DIR = path.join(BACKUP_DIR, 'auto');

export function ensureBackupDirs(): void {
  [BACKUP_DIR, MANUAL_DIR, AUTO_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function generateBackupFilename(type: 'manual' | 'auto'): string {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  return `backup-${type}-${timestamp}.zip`;
}

export function getBackupFiles(type: 'manual' | 'auto'): Array<{
  filename: string;
  path: string;
  size: number;
  createdAt: Date;
}> {
  const dir = type === 'manual' ? MANUAL_DIR : AUTO_DIR;
  
  if (!fs.existsSync(dir)) return [];
  
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.zip'))
    .map(filename => {
      const filePath = path.join(dir, filename);
      const stats = fs.statSync(filePath);
      return {
        filename,
        path: filePath,
        size: stats.size,
        createdAt: stats.mtime,
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  
  return files;
}

export async function createZipBackup(
  data: Record<string, any[]>,
  type: 'manual' | 'auto'
): Promise<{ filename: string; path: string; size: number }> {
  ensureBackupDirs();
  
  const filename = generateBackupFilename(type);
  const outputDir = type === 'manual' ? MANUAL_DIR : AUTO_DIR;
  const outputPath = path.join(outputDir, filename);
  
  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  return new Promise((resolve, reject) => {
    output.on('close', () => {
      const size = fs.statSync(outputPath).size;
      resolve({ filename, path: outputPath, size });
    });
    
    archive.on('error', (err) => reject(err));
    archive.pipe(output);
    

    Object.entries(data).forEach(([tableName, records]) => {
      const jsonContent = JSON.stringify(records, null, 2);
      archive.append(jsonContent, { name: `${tableName}.json` });
    });
    
    const metadata = {
      createdAt: new Date().toISOString(),
      type,
      version: '1.0',
      tables: Object.keys(data),
    };
    archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });
    
    archive.finalize();
  });
}

export async function extractBackupData(
  filename: string,
  type: 'manual' | 'auto'
): Promise<{
  data: Record<string, any[]>;
  metadata: any;
}> {
  const dir = type === 'manual' ? MANUAL_DIR : AUTO_DIR;
  const filePath = path.join(dir, filename);
  
  if (!fs.existsSync(filePath)) {
    throw new Error('Файл бэкапа не найден');
  }
  
  const extractDir = path.join(BACKUP_DIR, 'temp', Date.now().toString());
  fs.mkdirSync(extractDir, { recursive: true });
  
  await extract(filePath, { dir: extractDir });
  
  const metadataPath = path.join(extractDir, 'metadata.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

  const data: Record<string, any[]> = {};
  const files = fs.readdirSync(extractDir).filter(f => f.endsWith('.json') && f !== 'metadata.json');
  
  for (const file of files) {
    const tableName = file.replace('.json', '');
    const content = fs.readFileSync(path.join(extractDir, file), 'utf-8');
    data[tableName] = JSON.parse(content);
  }
  
  fs.rmSync(extractDir, { recursive: true, force: true });
  
  return { data, metadata };
}

export function cleanupOldAutoBackups(keepCount: number): void {
  const files = getBackupFiles('auto');
  
  if (files.length > keepCount) {
    const toDelete = files.slice(keepCount);
    toDelete.forEach(file => {
      try {
        fs.unlinkSync(file.path);
        console.log(`Удалён старый автобэкап: ${file.filename}`);
      } catch (err) {
        console.error(`Ошибка удаления ${file.filename}:`, err);
      }
    });
  }
}

export function getBackupFilePath(filename: string, type: 'manual' | 'auto'): string {
  const dir = type === 'manual' ? MANUAL_DIR : AUTO_DIR;
  return path.join(dir, filename);
}

export function deleteBackupFile(filename: string, type: 'manual' | 'auto'): boolean {
  const filePath = getBackupFilePath(filename, type);
  
  if (!fs.existsSync(filePath)) {
    return false;
  }
  
  fs.unlinkSync(filePath);
  return true;
}

export function detectBackupType(filename: string): 'manual' | 'auto' | null {
  if (filename.includes('manual')) return 'manual';
  if (filename.includes('auto')) return 'auto';
  return null;
}