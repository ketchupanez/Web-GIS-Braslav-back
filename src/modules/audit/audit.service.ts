import { prisma } from '../../shared/database';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'IMPORT';

interface AuditLogData {
  userId: string;
  action: AuditAction;
  tableRef?: string;
  tableName?: string;
  recordId?: string;
  recordName?: string;
  oldValue?: any;
  newValue?: any;
  description?: string;
}

export class AuditService {
  async log(data: AuditLogData) {
    await prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        tableRef: data.tableRef,
        tableName: data.tableName,
        recordId: data.recordId,
        recordName: data.recordName,
        oldValue: data.oldValue,
        newValue: data.newValue,
        description: data.description,
      },
    });
  }
  
  async logCreate(data: Omit<AuditLogData, 'action'>) {
    return this.log({ ...data, action: 'CREATE' });
  }

  async logUpdate(data: Omit<AuditLogData, 'action'>) {
    return this.log({ ...data, action: 'UPDATE' });
  }

  async logDelete(data: Omit<AuditLogData, 'action'>) {
    return this.log({ ...data, action: 'DELETE' });
  }
}