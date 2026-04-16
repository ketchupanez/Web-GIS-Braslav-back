import { AuthService } from '../../src/modules/auth/auth.service';

const authService = new AuthService();

async function main() {
  const args = process.argv.slice(2);
  const [login, password, fullName] = args;

  if (!login || !password || !fullName) {
    console.log('Использование: bun ts-node prisma/seed/create-super-admin.ts <login> <password> <fullName>');
    console.log('Пример: bun ts-node prisma/seed/create-super-admin.ts SuperAdmin123 SuperPassword123 "Супер Администратор"');
    process.exit(1);
  }

  try {
    await authService.createSuperAdmin(login, password, fullName);
    console.log('Супер-админ успешно создан');
    console.log(`Логин: ${login}`);
    console.log('ФИО:', fullName);
  } catch (error: any) {
    console.error('Ошибка:', error.message);
    process.exit(1);
  }
}

main();