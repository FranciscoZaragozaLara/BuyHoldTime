import { Module } from '@nestjs/common';
import { FirebaseAdminService } from './firebase-admin.service';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AdminOrApiKeyGuard } from './guards/admin-or-api-key.guard';
import { AuthController } from './auth.controller';

@Module({
  controllers: [AuthController],
  providers: [FirebaseAdminService, FirebaseAuthGuard, RolesGuard, AdminOrApiKeyGuard],
  exports: [FirebaseAdminService, FirebaseAuthGuard, RolesGuard, AdminOrApiKeyGuard],
})
export class AuthModule {}
