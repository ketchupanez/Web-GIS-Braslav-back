import { AuthService } from '../../src/modules/auth/auth.service';

const authService = new AuthService();

async function main() {
  const args = process.argv.slice(2);
  const [login, password, fullName] = args;

  if (!login || !password || !fullName) {
    console.log('Использование: npx ts-node prisma/seed/create-super-admin.ts <login> <password> <fullName>');
    console.log('Пример: npx ts-node prisma/seed/create-super-admin.ts admin123 SuperPassword123 "Иванов Иван Иванович"');
    process.exit(1);
  }

  try {
    await authService.createSuperAdmin(login, password, fullName);
    console.log('✅ Супер-админ успешно создан');
    console.log(`Логин: ${login}`);
    console.log('ФИО:', fullName);
  } catch (error: any) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

main();